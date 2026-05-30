mod commands;
mod db;
mod scraper;

use db::Database;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let database = Database::new().expect("Failed to initialize database");

    tauri::Builder::default()
        .manage(database)
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_posts,
            commands::get_post,
            commands::get_post_count,
            commands::get_user_ids,
            commands::get_user_stats,
            commands::get_all_users,
            commands::refresh_user_info,
            commands::refresh_post,
            commands::delete_post,
            commands::delete_user_posts,
            commands::get_settings,
            commands::save_settings,
            commands::scrape_timeline,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
