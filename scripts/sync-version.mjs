import fs from "node:fs";
import path from "node:path";

const nextVersion = process.argv[2]?.trim();

if (!nextVersion) {
  console.error("Usage: npm run version:sync -- <version>");
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(nextVersion)) {
  console.error(`Invalid semver: ${nextVersion}`);
  process.exit(1);
}

const repoRoot = process.cwd();
const packageJsonPath = path.join(repoRoot, "package.json");
const tauriConfigPath = path.join(repoRoot, "src-tauri", "tauri.conf.json");
const cargoTomlPath = path.join(repoRoot, "src-tauri", "Cargo.toml");

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
packageJson.version = nextVersion;
fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"));
tauriConfig.version = nextVersion;
fs.writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);

const cargoToml = fs.readFileSync(cargoTomlPath, "utf8");
const updatedCargoToml = cargoToml.replace(
  /^version = ".*"$/m,
  `version = "${nextVersion}"`,
);

if (cargoToml === updatedCargoToml) {
  console.error("Failed to update Cargo.toml version");
  process.exit(1);
}

fs.writeFileSync(cargoTomlPath, updatedCargoToml);

console.log(`Synced app version to ${nextVersion}`);
