{
  description = "A Nix-flake-based Node.js development environment with naabu";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (
      system: let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [
            # Overlay to define custom naabu package
            (final: prev: {
              naabu = prev.buildGoModule rec {
                pname = "naabu";
                version = "2.3.5";

                src = prev.fetchFromGitHub {
                  owner = "projectdiscovery";
                  repo = "naabu";
                  rev = "v${version}";
                  sha256 = "sha256-UHjWO/uCfUF6xylfYLbwiMwpNwZvlNoVRzRhRFxfqck="; # Replace with actual hash
                };

                vendorHash = "sha256-wl0BqZXd7NRNBY3SCLOwfwa3e91ar5JX6lxtkQChXHM="; # Replace with actual hash

                buildInputs = with prev; [libpcap];
                subPackages = ["cmd/naabu"]; # Build only the main naabu binary
              };
            })
          ];
        };
      in {
        packages.default = pkgs.naabu; # Expose naabu as a buildable package
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22
            nodePackages.typescript
            nodePackages.prettier
            nodePackages.eslint
            bun
            dnsx
            nuclei
            httpx
            subfinder
            naabu
            go-task
          ];
        };
      }
    );
}
