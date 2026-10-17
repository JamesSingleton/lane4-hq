//! Serial transport for Colorado Time Systems consoles (System 6, System 5,
//! 4000A, Gen7). Rust owns the wire (ADR 0003): port discovery, 9600/odd/8/1,
//! framing, checksums, timeouts, and retries. Decoding stays in TypeScript.

pub mod frame;

use std::io;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use serialport::{DataBits, FlowControl, Parity, SerialPort, SerialPortType, StopBits};
use tauri::ipc::Response;
use tauri::State;

use frame::{Link, TransportError};

pub const BAUD: u32 = 9600;

struct SerialLink(Box<dyn SerialPort>);

impl io::Read for SerialLink {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.0.read(buf)
    }
}

impl io::Write for SerialLink {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.0.write(buf)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.0.flush()
    }
}

impl Link for SerialLink {
    fn set_timeout(&mut self, timeout: Duration) -> io::Result<()> {
        self.0.set_timeout(timeout).map_err(io::Error::from)
    }
    fn clear_input(&mut self) -> io::Result<()> {
        self.0
            .clear(serialport::ClearBuffer::Input)
            .map_err(io::Error::from)
    }
}

struct Connection {
    port: String,
    link: SerialLink,
}

/// One connection, one request in flight at a time.
#[derive(Default, Clone)]
pub struct TimingState(Arc<Mutex<Option<Connection>>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortInfo {
    name: String,
    label: String,
    usb: bool,
    vid: Option<u16>,
    pid: Option<u16>,
    manufacturer: Option<String>,
}

/// On macOS each device appears as `/dev/tty.*` and `/dev/cu.*`; `tty.*`
/// blocks on carrier detect, which the timer never raises.
fn listable(name: &str) -> bool {
    !name.starts_with("/dev/tty.") && !name.contains("Bluetooth-Incoming-Port")
}

fn describe(name: &str, kind: &SerialPortType) -> PortInfo {
    match kind {
        SerialPortType::UsbPort(usb) => {
            let product = usb
                .product
                .clone()
                .unwrap_or_else(|| "USB serial adapter".into());
            PortInfo {
                name: name.into(),
                label: format!("{product} ({name})"),
                usb: true,
                vid: Some(usb.vid),
                pid: Some(usb.pid),
                manufacturer: usb.manufacturer.clone(),
            }
        }
        _ => PortInfo {
            name: name.into(),
            label: name.into(),
            usb: false,
            vid: None,
            pid: None,
            manufacturer: None,
        },
    }
}

#[tauri::command]
pub async fn timing_list_ports() -> Result<Vec<PortInfo>, TransportError> {
    let ports = serialport::available_ports().map_err(|e| TransportError::Io(e.to_string()))?;
    let mut out: Vec<PortInfo> = ports
        .iter()
        .filter(|p| listable(&p.port_name))
        .map(|p| describe(&p.port_name, &p.port_type))
        .collect();
    // USB adapters first; that's what nearly every deck laptop uses.
    out.sort_by(|a, b| b.usb.cmp(&a.usb).then(a.name.cmp(&b.name)));
    Ok(out)
}

#[tauri::command]
pub async fn timing_open(
    state: State<'_, TimingState>,
    port: String,
) -> Result<(), TransportError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let serial = serialport::new(&port, BAUD)
            .data_bits(DataBits::Eight)
            .parity(Parity::Odd)
            .stop_bits(StopBits::One)
            .flow_control(FlowControl::None)
            .timeout(frame::RESPONSE_TIMEOUT)
            .open()
            .map_err(|e| TransportError::Io(format!("Couldn't open {port}: {e}")))?;
        let mut guard = state
            .0
            .lock()
            .map_err(|_| TransportError::Io("Timing state poisoned.".into()))?;
        *guard = Some(Connection {
            port,
            link: SerialLink(serial),
        });
        Ok(())
    })
    .await
    .map_err(|e| TransportError::Io(e.to_string()))?
}

#[tauri::command]
pub async fn timing_close(state: State<'_, TimingState>) -> Result<(), TransportError> {
    let mut guard = state
        .0
        .lock()
        .map_err(|_| TransportError::Io("Timing state poisoned.".into()))?;
    *guard = None;
    Ok(())
}

#[tauri::command]
pub async fn timing_connected_port(
    state: State<'_, TimingState>,
) -> Result<Option<String>, TransportError> {
    let guard = state
        .0
        .lock()
        .map_err(|_| TransportError::Io("Timing state poisoned.".into()))?;
    Ok(guard.as_ref().map(|c| c.port.clone()))
}

/// Send one command's DATA bytes and return the reply's verified DATA bytes.
#[tauri::command]
pub async fn timing_request(
    state: State<'_, TimingState>,
    data: Vec<u8>,
) -> Result<Response, TransportError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = state
            .0
            .lock()
            .map_err(|_| TransportError::Io("Timing state poisoned.".into()))?;
        let connection = guard.as_mut().ok_or(TransportError::NotConnected)?;
        let reply = frame::request(&mut connection.link, &data);
        if let Err(TransportError::Io(_)) = &reply {
            // The adapter was unplugged or the port died; drop it so the UI reconnects.
            *guard = None;
        }
        reply.map(Response::new)
    })
    .await
    .map_err(|e| TransportError::Io(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hides_blocking_tty_devices() {
        assert!(!listable("/dev/tty.usbserial-A10K"));
        assert!(listable("/dev/cu.usbserial-A10K"));
        assert!(listable("COM3"));
        assert!(!listable("/dev/cu.Bluetooth-Incoming-Port"));
    }

    #[test]
    fn labels_usb_adapters() {
        let usb = describe(
            "COM4",
            &SerialPortType::UsbPort(serialport::UsbPortInfo {
                vid: 0x0403,
                pid: 0x6001,
                serial_number: None,
                manufacturer: Some("FTDI".into()),
                product: Some("FT232R USB UART".into()),
            }),
        );
        assert_eq!(usb.label, "FT232R USB UART (COM4)");
        assert!(usb.usb);
        let plain = describe("COM1", &SerialPortType::Unknown);
        assert_eq!(plain.label, "COM1");
    }
}
