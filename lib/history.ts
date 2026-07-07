import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { RoundtableResult, StoredMeeting } from "@/types";

const historyPath = path.join(process.cwd(), "data", "meetings.json");

export async function saveMeeting(idea: string, result: RoundtableResult): Promise<void> {
  const meeting: StoredMeeting = {
    ...result,
    id: crypto.randomUUID(),
    idea,
    createdAt: new Date().toISOString()
  };

  await mkdir(path.dirname(historyPath), { recursive: true });

  let meetings: StoredMeeting[] = [];
  try {
    meetings = JSON.parse(await readFile(historyPath, "utf8")) as StoredMeeting[];
  } catch {
    meetings = [];
  }

  meetings.unshift(meeting);
  await writeFile(historyPath, JSON.stringify(meetings.slice(0, 50), null, 2));
}
