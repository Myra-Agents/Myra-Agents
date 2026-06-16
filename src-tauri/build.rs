fn main() {
  // Bake the embedded server version (pinned in ../server-version.json, the same
  // file build-sidecar.mjs reads) into the binary as MYRA_EMBEDDED_SERVER_VERSION.
  // The runtime stamps this beside the installed copy and re-installs when an app
  // update ships a newer server. Missing/unparseable file → "unknown", which the
  // runtime treats as "don't force an upgrade" (install-if-absent only).
  let version = std::fs::read_to_string("../server-version.json")
    .ok()
    .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
    .and_then(|v| v.get("version").and_then(|x| x.as_str()).map(str::to_string))
    .unwrap_or_else(|| "unknown".into());
  println!("cargo:rustc-env=MYRA_EMBEDDED_SERVER_VERSION={version}");
  println!("cargo:rerun-if-changed=../server-version.json");

  tauri_build::build()
}
