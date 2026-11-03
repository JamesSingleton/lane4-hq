import { MEET_FILE_EXTENSIONS, type SourceFile } from "../lib/meet-file";
import {
  isTauri,
  pickBackupPath,
  pickMeetFilePaths,
  readBackupFile,
  readMeetFiles,
} from "../lib/native";

const BROWSER_ACCEPT = MEET_FILE_EXTENSIONS.map((ext) => `.${ext}`).join(",");

function pickInBrowser(
  multiple: boolean,
  accept: string,
): Promise<SourceFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = multiple;
    input.accept = accept;
    input.addEventListener("change", async () => {
      const files = [...(input.files ?? [])];
      resolve(
        await Promise.all(
          files.map(async (file) => ({
            filename: file.name,
            bytes: new Uint8Array(await file.arrayBuffer()),
          })),
        ),
      );
    });
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

/** Native open dialog on desktop, a file input in the browser dev shell. */
export async function pickMeetFiles(
  title: string,
  multiple = true,
): Promise<SourceFile[]> {
  if (!isTauri()) return pickInBrowser(multiple, BROWSER_ACCEPT);
  const paths = await pickMeetFilePaths(title, multiple);
  return paths.length > 0 ? readMeetFiles(paths) : [];
}

/** The text of a `.lane4meet` file the user picks, or null if they cancel. */
export async function pickBackupText(): Promise<string | null> {
  if (!isTauri()) return pickBackupInBrowser();
  const path = await pickBackupPath();
  return path ? readBackupFile(path) : null;
}

export async function pickBackupInBrowser(): Promise<string | null> {
  const [file] = await pickInBrowser(false, ".lane4meet");
  return file ? new TextDecoder().decode(file.bytes) : null;
}
