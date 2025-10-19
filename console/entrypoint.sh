#!/usr/bin bash

# The first part wrapped in a function
makeSedCommands() {
  printenv | \
      grep  '^VITE' | \
      sed -r "s/=/ /g" | \
      xargs -n 2 bash -c 'echo "sed -i \"s#APP_$0#$1#g\""'
}

# Set the delimiter to newlines (needed for looping over the function output)
IFS=$'\n'
# For each sed command
for c in $(makeSedCommands); do
  # For each file in the ./ directory
  for f in $(find ./ -type f); do
    # Execute the command against the file
    COMMAND="$c $f"
    eval $COMMAND
  done
done

echo "Starting entrypoint.sh"
# Run any arguments passed to this script
exec "$@"