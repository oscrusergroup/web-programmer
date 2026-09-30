import { spawn } from "node:child_process";

export class CommandError extends Error {
  constructor(
    message: string,
    public output: string,
  ) {
    super(`${message}\n${output}`);
  }
}

/** Bound the whole compiler process tree, including avr-g++ children. */
export function runCommand(
  executable: string,
  args: string[],
  { timeoutMs = 240_000, outputLimit = 2 * 1024 * 1024 } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const grouped = process.platform !== "win32";
    const child = spawn(executable, args, {
      detached: grouped,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, LC_ALL: "C" },
    });
    let output = "",
      total = 0,
      failure = "";
    function stop(reason: string) {
      if (failure) return;
      failure = reason;
      if (!child.pid) return;
      if (grouped) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      } else {
        const killer = spawn(
          "taskkill",
          ["/pid", String(child.pid), "/T", "/F"],
          { stdio: "ignore" },
        );
        killer.on("error", () => child.kill("SIGKILL"));
      }
    }
    const timer = setTimeout(
      () => stop("The compiler exceeded its time limit."),
      timeoutMs,
    );
    function append(chunk: Buffer) {
      total += chunk.length;
      output = (output + chunk.toString("utf8")).slice(-100_000);
      if (total > outputLimit) stop("The compiler exceeded its output limit.");
    }
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new CommandError(error.message, output));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (failure || code !== 0)
        reject(
          new CommandError(
            failure || `Compiler exited with status ${code}.`,
            output,
          ),
        );
      else resolve(output.trim());
    });
  });
}
