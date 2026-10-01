//! CTS packet framing: `NUM (u16 LE) | DATA | DIC (u16 LE)`, where NUM counts
//! the whole packet and DIC is 0xFFFF minus every byte of NUM and DATA.
//! Mirrors `@lane4hq/timing-cts/frame`; both are tested against the vendor
//! vectors in F397 Rev. F.

use std::io::{self, Read, Write};
use std::thread;
use std::time::Duration;

use serde::Serialize;

pub const MIN_PACKET: usize = 5;
pub const MAX_DATA: usize = 0xffff - 4;
/// The timer answers within 500 ms or the command should be re-sent.
pub const RESPONSE_TIMEOUT: Duration = Duration::from_millis(500);
/// Longest gap allowed between bytes once a packet has started.
pub const INTER_BYTE_TIMEOUT: Duration = Duration::from_millis(500);
/// After a bad packet the timer ignores anything sent in the next 50 ms.
pub const QUIET_GAP: Duration = Duration::from_millis(50);
pub const RETRIES: usize = 3;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, thiserror::Error)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum TransportError {
    #[error("No timer connected.")]
    NotConnected,
    #[error("The timer didn't answer. Check that it's on, cabled to its top RS232 port (COM 1), and not in a menu.")]
    Timeout,
    #[error("The timer's reply failed its checksum.")]
    BadChecksum,
    #[error("The timer sent a packet too short to be valid.")]
    ShortPacket,
    #[error("Command is empty or too large.")]
    BadCommand,
    #[error("{0}")]
    Io(String),
}

impl From<io::Error> for TransportError {
    fn from(e: io::Error) -> Self {
        match e.kind() {
            io::ErrorKind::TimedOut | io::ErrorKind::WouldBlock => TransportError::Timeout,
            _ => TransportError::Io(e.to_string()),
        }
    }
}

pub fn dic(bytes: &[u8]) -> u16 {
    bytes
        .iter()
        .fold(0xffffu16, |sum, &b| sum.wrapping_sub(u16::from(b)))
}

pub fn encode(data: &[u8]) -> Result<Vec<u8>, TransportError> {
    if data.is_empty() || data.len() > MAX_DATA {
        return Err(TransportError::BadCommand);
    }
    let total = data.len() + 4;
    let mut packet = Vec::with_capacity(total);
    packet.extend_from_slice(&(total as u16).to_le_bytes());
    packet.extend_from_slice(data);
    let check = dic(&packet);
    packet.extend_from_slice(&check.to_le_bytes());
    Ok(packet)
}

pub fn decode(packet: &[u8]) -> Result<Vec<u8>, TransportError> {
    if packet.len() < MIN_PACKET {
        return Err(TransportError::ShortPacket);
    }
    let num = usize::from(u16::from_le_bytes([packet[0], packet[1]]));
    if num != packet.len() {
        return Err(TransportError::ShortPacket);
    }
    let expected = dic(&packet[..num - 2]);
    let actual = u16::from_le_bytes([packet[num - 2], packet[num - 1]]);
    if expected != actual {
        return Err(TransportError::BadChecksum);
    }
    Ok(packet[2..num - 2].to_vec())
}

/// A byte link to the timer: a serial port in production, a mock in tests.
pub trait Link: Read + Write {
    fn set_timeout(&mut self, timeout: Duration) -> io::Result<()>;
    fn clear_input(&mut self) -> io::Result<()>;
}

fn read_byte(link: &mut dyn Link, timeout: Duration) -> Result<u8, TransportError> {
    link.set_timeout(timeout)?;
    let mut byte = [0u8; 1];
    loop {
        match link.read(&mut byte) {
            Ok(1) => return Ok(byte[0]),
            Ok(_) => return Err(TransportError::Timeout),
            Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e.into()),
        }
    }
}

/// Read one packet. The first byte must arrive within 500 ms; after that each
/// byte must follow the previous one within 500 ms. (A long race at 9600 baud
/// takes seconds to send, so the vendor's "rest within 500 ms" is applied per
/// byte, not to the whole packet.)
pub fn read_packet(link: &mut dyn Link) -> Result<Vec<u8>, TransportError> {
    let lo = read_byte(link, RESPONSE_TIMEOUT)?;
    let hi = read_byte(link, INTER_BYTE_TIMEOUT)?;
    let num = usize::from(u16::from_le_bytes([lo, hi]));
    if num < MIN_PACKET {
        return Err(TransportError::ShortPacket);
    }
    let mut packet = Vec::with_capacity(num);
    packet.push(lo);
    packet.push(hi);
    link.set_timeout(INTER_BYTE_TIMEOUT)?;
    let mut chunk = [0u8; 256];
    while packet.len() < num {
        let want = (num - packet.len()).min(chunk.len());
        match link.read(&mut chunk[..want]) {
            Ok(0) => return Err(TransportError::Timeout),
            Ok(n) => packet.extend_from_slice(&chunk[..n]),
            Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e.into()),
        }
    }
    decode(&packet)
}

fn retryable(e: &TransportError) -> bool {
    matches!(
        e,
        TransportError::Timeout | TransportError::BadChecksum | TransportError::ShortPacket
    )
}

/// Send one command and return the verified DATA of the reply, re-sending on
/// timeouts and line errors.
pub fn request(link: &mut dyn Link, data: &[u8]) -> Result<Vec<u8>, TransportError> {
    let packet = encode(data)?;
    let mut last = TransportError::Timeout;
    for attempt in 0..=RETRIES {
        if attempt > 0 {
            thread::sleep(QUIET_GAP);
            link.clear_input()?;
        }
        link.write_all(&packet)?;
        link.flush()?;
        match read_packet(link) {
            Ok(reply) => return Ok(reply),
            Err(e) if retryable(&e) => last = e,
            Err(e) => return Err(e),
        }
    }
    Err(last)
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::collections::VecDeque;

    /// Scripted link: each `write` pops the next canned reply into the read buffer.
    pub struct MockLink {
        pub replies: VecDeque<Vec<u8>>,
        pub written: Vec<Vec<u8>>,
        pending: VecDeque<u8>,
        pub cleared: usize,
    }

    impl MockLink {
        pub fn new(replies: Vec<Vec<u8>>) -> Self {
            Self {
                replies: replies.into(),
                written: Vec::new(),
                pending: VecDeque::new(),
                cleared: 0,
            }
        }
    }

    impl Read for MockLink {
        fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
            if self.pending.is_empty() {
                return Err(io::Error::new(io::ErrorKind::TimedOut, "timeout"));
            }
            let n = buf.len().min(self.pending.len()).min(7);
            for slot in buf.iter_mut().take(n) {
                *slot = self.pending.pop_front().unwrap();
            }
            Ok(n)
        }
    }

    impl Write for MockLink {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            self.written.push(buf.to_vec());
            if let Some(reply) = self.replies.pop_front() {
                self.pending.extend(reply);
            }
            Ok(buf.len())
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    impl Link for MockLink {
        fn set_timeout(&mut self, _: Duration) -> io::Result<()> {
            Ok(())
        }
        fn clear_input(&mut self) -> io::Result<()> {
            self.cleared += 1;
            self.pending.clear();
            Ok(())
        }
    }

    fn hex(s: &str) -> Vec<u8> {
        s.split_whitespace()
            .map(|b| u8::from_str_radix(b, 16).unwrap())
            .collect()
    }

    #[test]
    fn vendor_vectors_encode_and_decode() {
        for (data, packet) in [
            ("57", "05 00 57 A3 FF"),
            ("53", "05 00 53 A7 FF"),
            ("06 00", "06 00 06 00 F3 FF"),
            ("07", "05 00 07 F3 FF"),
        ] {
            assert_eq!(encode(&hex(data)).unwrap(), hex(packet));
            assert_eq!(decode(&hex(packet)).unwrap(), hex(data));
        }
    }

    #[test]
    fn rejects_bad_packets() {
        assert_eq!(
            decode(&hex("05 00 57 A4 FF")),
            Err(TransportError::BadChecksum)
        );
        assert_eq!(
            decode(&hex("06 00 57 A3 FF")),
            Err(TransportError::ShortPacket)
        );
        assert_eq!(
            decode(&hex("04 00 57 A3")),
            Err(TransportError::ShortPacket)
        );
        assert_eq!(encode(&[]), Err(TransportError::BadCommand));
    }

    #[test]
    fn requests_and_reads_long_packets_in_chunks() {
        let data: Vec<u8> = (0..600).map(|i| (i % 251) as u8).collect();
        let reply = encode(&data).unwrap();
        let mut link = MockLink::new(vec![reply]);
        assert_eq!(request(&mut link, b"S").unwrap(), data);
        assert_eq!(link.written, vec![hex("05 00 53 A7 FF")]);
    }

    #[test]
    fn retries_after_timeouts_and_bad_checksums() {
        let good = encode(b"SWIM 3.25\0").unwrap();
        let mut corrupt = good.clone();
        *corrupt.last_mut().unwrap() ^= 0xff;
        let mut link = MockLink::new(vec![vec![], corrupt, good]);
        assert_eq!(request(&mut link, b"W").unwrap(), b"SWIM 3.25\0".to_vec());
        assert_eq!(link.written.len(), 3);
        assert_eq!(link.cleared, 2);
    }

    #[test]
    fn gives_up_after_three_retries() {
        let mut link = MockLink::new(vec![]);
        assert_eq!(request(&mut link, b"W"), Err(TransportError::Timeout));
        assert_eq!(link.written.len(), RETRIES + 1);
    }

    #[test]
    fn short_num_is_a_line_error() {
        let mut link = MockLink::new(vec![
            vec![3, 0, 0],
            vec![3, 0, 0],
            vec![3, 0, 0],
            vec![3, 0, 0],
        ]);
        assert_eq!(request(&mut link, b"W"), Err(TransportError::ShortPacket));
    }

    #[test]
    fn truncated_packet_times_out() {
        let mut reply = encode(b"ABCDEFGH").unwrap();
        reply.truncate(6);
        let mut link = MockLink::new(vec![reply]);
        assert_eq!(
            read_packet_after_write(&mut link),
            Err(TransportError::Timeout)
        );
    }

    fn read_packet_after_write(link: &mut MockLink) -> Result<Vec<u8>, TransportError> {
        link.write_all(b"x").unwrap();
        read_packet(link)
    }
}
