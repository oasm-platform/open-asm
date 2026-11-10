import { matchBuiltinDeny } from './command-deny';

describe('matchBuiltinDeny', () => {
  it.each([
    ['rm -rf /', 'recursive-delete-root'],
    ['sudo rm -r -f /*', 'recursive-delete-root'],
    ['bash -c "rm -fr ~/"', 'recursive-delete-root'],
    ['r"m" -rf \'/etc\'', 'recursive-delete-root'],
    ['ls; /bin/rm --recursive $HOME', 'recursive-delete-root'],
    ['rm -f --no-preserve-root /tmp', 'recursive-delete-root'],
    ['mkfs.ext4 /dev/sdb1', 'format-disk'],
    ['dd if=/dev/zero of=/dev/sda bs=1M', 'raw-device-write'],
    ['cat img > /dev/nvme0n1', 'raw-device-write'],
    [':(){ :|:& };:', 'fork-bomb'],
    ['bomb() { bomb | bomb & }; bomb', 'fork-bomb'],
    ['sudo shutdown -h now', 'host-shutdown'],
    ['systemctl reboot', 'host-shutdown'],
    ['psql -c "DROP TABLE users"', 'destructive-sql'],
    ["mysql -e 'truncate table logs'", 'destructive-sql'],
    ['sqlite3 db "DELETE FROM users;"', 'destructive-sql'],
    ['redis-cli -h 10.0.0.5 FLUSHALL', 'redis-flush'],
    ['curl -X DELETE https://api.acme.io/users/1', 'http-delete'],
    ['curl -sXDELETE https://api.acme.io/x', 'http-delete'],
    ['curl --request=DELETE https://acme.io', 'http-delete'],
    ['wget --method=DELETE https://acme.io/a', 'http-delete'],
    ['http DELETE acme.io/a', 'http-delete'],
    ['python3 -c "import requests; requests.delete(\'https://a.io\')"', 'http-delete'],
  ])('refuses %s', (command, rule) => {
    expect(matchBuiltinDeny(command)?.ruleId).toBe(`builtin:${rule}`);
  });

  it.each([
    'rm -rf ./out /tmp/scan-1',
    'rm -f /etc/hosts.bak',
    'dd if=/dev/urandom of=/dev/null count=1',
    'nmap -sV -p 1-1000 10.0.0.5',
    'curl -X POST https://api.acme.io/login -d @body.json',
    'curl -I https://acme.io/delete',
    'psql -c "DELETE FROM sessions WHERE expired"',
    'truncate -s 0 out.log',
    'grep -ri password ./loot',
    'iptables -L INPUT -j DROP',
  ])('lets %s through', (command) => {
    expect(matchBuiltinDeny(command)).toBeNull();
  });
});
