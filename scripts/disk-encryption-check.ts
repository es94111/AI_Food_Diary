/**
 * Stage E read-only disk-encryption evidence collector.
 *
 * This script does not enable encryption. It prints local host signals that an
 * operator can attach to the Stage E checklist: BitLocker on Windows, LUKS on
 * Linux, and Docker named-volume mountpoints when Docker is available.
 */
import { execFileSync } from "node:child_process";
import { platform } from "node:os";

function run(command: string, args: string[]) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `unavailable: ${message}`;
  }
}

function printSection(title: string, body: string) {
  console.log(`\n## ${title}`);
  console.log(body || "(no output)");
}

function dockerVolume(name: string) {
  return run("docker", ["volume", "inspect", name, "--format", "{{.Mountpoint}}"]);
}

function checkWindows() {
  const ps = "Get-BitLockerVolume | Select-Object MountPoint,VolumeStatus,ProtectionStatus,EncryptionPercentage | Format-Table -AutoSize";
  printSection("Windows BitLocker", run("powershell.exe", ["-NoProfile", "-Command", ps]));
}

function checkLinux() {
  printSection("Linux Mounted Filesystems", run("findmnt", ["-no", "SOURCE,TARGET,FSTYPE,OPTIONS"]));
  printSection("Linux Block Devices", run("lsblk", ["-o", "NAME,TYPE,FSTYPE,MOUNTPOINTS"]));
  printSection("LUKS Devices", run("bash", ["-lc", "lsblk -no NAME,FSTYPE,MOUNTPOINTS | awk '$2 == \"crypto_LUKS\" || $2 ~ /^dm-crypt/ { print }'"]));
}

function checkDockerVolumes() {
  printSection("Docker Volume postgres_data", dockerVolume("ai_food_diary_postgres_data"));
  printSection("Docker Volume minio_data", dockerVolume("ai_food_diary_minio_data"));
  console.log("\nIf these volumes resolve under an unencrypted filesystem, Stage E is not complete for local Docker data.");
}

function main() {
  console.log("Stage E disk-encryption check (read-only)");
  console.log(`Platform: ${platform()}`);

  if (platform() === "win32") {
    checkWindows();
  } else if (platform() === "linux") {
    checkLinux();
  } else {
    console.log("No built-in disk-encryption probe for this OS. Use the runbook checklist.");
  }

  checkDockerVolumes();
  console.log("\nProduction cloud resources must be verified in the cloud console or IaC: DB volume, object storage, backups, and host/container volumes.");
}

main();
