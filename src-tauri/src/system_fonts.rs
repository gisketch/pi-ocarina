use std::collections::BTreeMap;

#[derive(serde::Serialize)]
pub struct SystemFonts {
    families: Vec<String>,
}

fn normalize_font_families(values: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut families = BTreeMap::new();
    for value in values {
        let family = value.trim();
        if family.is_empty() || family.len() > 128 || family.chars().any(char::is_control) {
            continue;
        }
        families
            .entry(family.to_lowercase())
            .or_insert_with(|| family.to_string());
        if families.len() == 2048 {
            break;
        }
    }
    families.into_values().collect()
}

#[tauri::command]
pub fn system_font_families() -> Result<SystemFonts, String> {
    #[cfg(target_os = "macos")]
    {
        use objc2::MainThreadMarker;
        use objc2_app_kit::NSFontManager;
        let mtm = MainThreadMarker::new()
            .ok_or_else(|| "system font discovery requires the main thread".to_string())?;
        let available = NSFontManager::sharedFontManager(mtm).availableFontFamilies();
        let families = available.iter().map(|family| family.to_string());
        Ok(SystemFonts {
            families: normalize_font_families(families),
        })
    }
    #[cfg(not(target_os = "macos"))]
    Ok(SystemFonts {
        families: Vec::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn font_families_are_bounded_deduplicated_and_sorted() {
        assert_eq!(
            normalize_font_families([
                " Zebra ".into(),
                "alpha".into(),
                "ALPHA".into(),
                "bad\nfont".into(),
                "".into()
            ]),
            vec!["alpha", "Zebra"]
        );
    }
}
