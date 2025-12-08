#!/bin/sh

makeSedCommands() {
    printenv | grep '^VITE' | \
    while IFS='=' read -r key value; do
        # In ra lệnh sed
        # APP_KEY sẽ được replace thành value
        echo "sed -i \"s#APP_${key}#${value}#g\""
    done
}

# IFS newline
IFS='
'

# Loop từng lệnh sed
for c in $(makeSedCommands); do
    # Loop tất cả file
    for f in $(find ./ -type f); do
        # Thực thi command
        COMMAND="$c $f"
        eval "$COMMAND"
    done
done

echo "Starting entrypoint.sh"
exec "$@"
