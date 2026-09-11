#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{ErrorKind, Read, Write},
    net::TcpListener,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

static AUTH_CALLBACK_LOCK: Mutex<()> = Mutex::new(());
static AUTH_CANCELLED: AtomicBool = AtomicBool::new(false);

fn safe_path_component(value: &str, fallback: &str) -> String {
    let cleaned: String = value
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-') { ch } else { '_' })
        .collect();
    let trimmed = cleaned.trim_matches('_');
    if trimmed.is_empty() { fallback.to_string() } else { trimmed.to_string() }
}

fn offline_documents_dir(app: &AppHandle, package_id: &str) -> Result<PathBuf, String> {
    let base = app.path().app_local_data_dir().map_err(|_| "De lokale werkmap kon niet worden bepaald.".to_string())?;
    Ok(base.join("offline-documenten").join(safe_path_component(package_id, "formulier")))
}

#[tauri::command]
fn save_offline_document(app: AppHandle, package_id: String, file_name: String, contents: Vec<u8>) -> Result<String, String> {
    let dir = offline_documents_dir(&app, &package_id)?;
    fs::create_dir_all(&dir).map_err(|_| "De lokale werkmap kon niet worden aangemaakt.".to_string())?;
    let path = dir.join(safe_path_component(&file_name, "document"));
    fs::write(&path, contents).map_err(|_| "Het lokale bestand kon niet worden opgeslagen.".to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn open_offline_documents_folder(app: AppHandle, package_id: String) -> Result<(), String> {
    let dir = offline_documents_dir(&app, &package_id)?;
    fs::create_dir_all(&dir).map_err(|_| "De lokale werkmap kon niet worden geopend.".to_string())?;
    std::process::Command::new("explorer.exe").arg(dir).spawn().map_err(|_| "Verkenner kon niet worden geopend.".to_string())?;
    Ok(())
}

#[tauri::command]
fn remove_offline_documents_folder(app: AppHandle, package_id: String) -> Result<(), String> {
    let dir = offline_documents_dir(&app, &package_id)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|_| "De lokale bestanden konden niet worden verwijderd.".to_string())?;
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthCodeRedemptionRequest {
    tenant_id: String,
    client_id: String,
    redirect_uri: String,
    code: String,
    code_verifier: String,
    scope: String,
}

#[derive(Debug, Deserialize)]
struct EntraTokenResponse {
    access_token: Option<String>,
    expires_in: Option<u64>,
    id_token: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthCodeRedemptionResponse {
    access_token: String,
    expires_in: u64,
    id_token: Option<String>,
}

#[tauri::command]
async fn authenticate_with_oidc(app: AppHandle, authorize_url: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = AUTH_CALLBACK_LOCK
            .lock()
            .map_err(|_| "Aanmelden is tijdelijk niet beschikbaar.".to_string())?;
        AUTH_CANCELLED.store(false, Ordering::SeqCst);
        let listener = TcpListener::bind("127.0.0.1:43863").map_err(|_| {
            "Aanmelden kan niet starten; de lokale callbackpoort is al in gebruik.".to_string()
        })?;
        listener
            .set_nonblocking(true)
            .map_err(|error| format!("De lokale aanmeldpoort kon niet worden voorbereid: {error}"))?;

        app.opener()
            .open_url(&authorize_url, None::<&str>)
            .map_err(|error| format!("Het aanmeldvenster kon niet worden geopend: {error}"))?;

        let deadline = Instant::now() + Duration::from_secs(120);
        let (mut stream, _) = loop {
            if AUTH_CANCELLED.load(Ordering::SeqCst) {
                return Err("De aanmeldpoging is afgebroken.".to_string());
            }

            match listener.accept() {
                Ok(connection) => break connection,
                Err(error) if error.kind() == ErrorKind::WouldBlock => {
                    if Instant::now() >= deadline {
                        return Err("Aanmelden duurt te lang. Kies Opnieuw proberen.".to_string());
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
                Err(error) => {
                    return Err(format!("De aanmeldcallback kon niet worden ontvangen: {error}"));
                }
            }
        };
        stream
            .set_read_timeout(Some(Duration::from_secs(10)))
            .map_err(|error| format!("De aanmeldcallback kon niet worden gelezen: {error}"))?;

        let mut buffer = [0_u8; 8192];
        let byte_count = stream
            .read(&mut buffer)
            .map_err(|error| format!("De aanmeldcallback kon niet worden gelezen: {error}"))?;
        let request = String::from_utf8_lossy(&buffer[..byte_count]);
        let request_target = request
            .lines()
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
            .ok_or_else(|| "De aanmeldcallback is ongeldig.".to_string())?;

        let html = "<!doctype html><html lang=\"nl\"><head><meta charset=\"utf-8\"><title>Ember Offline</title><style>body{font-family:Segoe UI,Arial,sans-serif;background:#f4f7fb;color:#10264a;margin:0;display:grid;min-height:100vh;place-items:center}.card{background:#fff;border:1px solid #d7e1ef;border-radius:16px;box-shadow:0 10px 30px rgba(16,38,74,.08);max-width:440px;margin:24px;padding:28px}h1{font-size:22px;margin:0 0 10px}p{line-height:1.5;margin:0}</style></head><body><main class=\"card\"><h1>Aanmelden gelukt</h1><p>Je kunt terug naar Ember Offline. Dit tabblad sluit automatisch.</p></main><script>history.replaceState({},document.title,'/auth/callback');setTimeout(()=>window.close(),1200);</script></body></html>";
        let response = format!(
            "HTTP/1.1 200 OK\\r\\nContent-Type: text/html; charset=utf-8\\r\\nContent-Length: {}\\r\\nConnection: close\\r\\n\\r\\n{}",
            html.len(),
            html
        );
        stream
            .write_all(response.as_bytes())
            .map_err(|error| format!("De aanmeldcallback kon niet worden afgerond: {error}"))?;

        Ok(format!("http://127.0.0.1:43863{request_target}"))
    })
    .await
    .map_err(|error| format!("Aanmelden kon niet worden gestart: {error}"))?
}

#[tauri::command]
fn cancel_desktop_auth() {
    AUTH_CANCELLED.store(true, Ordering::SeqCst);
}

#[tauri::command]
async fn redeem_auth_code(
    payload: AuthCodeRedemptionRequest,
) -> Result<AuthCodeRedemptionResponse, String> {
    let endpoint = format!(
        "https://login.microsoftonline.com/{}/oauth2/v2.0/token",
        payload.tenant_id
    );
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| "Microsoft kan de aanmelding nu niet voorbereiden.".to_string())?;
    let response = client
        .post(endpoint)
        .form(&[
            ("client_id", payload.client_id.as_str()),
            ("grant_type", "authorization_code"),
            ("code", payload.code.as_str()),
            ("redirect_uri", payload.redirect_uri.as_str()),
            ("code_verifier", payload.code_verifier.as_str()),
            ("scope", payload.scope.as_str()),
        ])
        .send()
        .await
        .map_err(|_| "Microsoft is tijdelijk niet bereikbaar.".to_string())?;
    let status = response.status();
    let token = response
        .json::<EntraTokenResponse>()
        .await
        .map_err(|_| "Microsoft gaf een ongeldige reactie terug.".to_string())?;

    if !status.is_success() {
        return Err(token
            .error_description
            .unwrap_or_else(|| "Microsoft heeft de aanmelding afgewezen.".to_string()));
    }

    Ok(AuthCodeRedemptionResponse {
        access_token: token
            .access_token
            .ok_or_else(|| "Microsoft gaf geen toegangstoken terug.".to_string())?,
        expires_in: token.expires_in.unwrap_or(3600),
        id_token: token.id_token,
    })
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            authenticate_with_oidc,
            cancel_desktop_auth,
            redeem_auth_code,
            save_offline_document,
            open_offline_documents_folder,
            remove_offline_documents_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running ember offline");
}
