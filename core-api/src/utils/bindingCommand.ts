export default function bindingCommand(command: string, args: object): string {
    const commandBuilder = Object.entries(args).reduce((cmd, [key, value]) => {
        return cmd.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }, command);
    return commandBuilder;
}