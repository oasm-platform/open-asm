export default async function runCommand(command: string) {
  const process = Bun.spawn(["sh", "-c", command], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = (await new Response(process.stdout).text()).trim();
  return output;
}
