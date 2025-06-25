export default async function runCommand(command: string) {
  const arrString = command.split(" ");
  const process = Bun.spawn(arrString, {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = (await new Response(process.stdout).text()).trim();
  return output;
}
