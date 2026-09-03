use serde::{Deserialize, Serialize};
use std::{
    cmp::Ordering,
    fs,
    io::Write,
    path::{Path, PathBuf},
};
use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, Monitor, Position, Size, WebviewWindow,
    Window, WindowEvent,
};
use tempfile::Builder;

const WINDOW_GEOMETRY_VERSION: u32 = 1;
const WINDOW_GEOMETRY_FILENAME: &str = "window-geometry.json";
const MINIMUM_WINDOW_WIDTH: f64 = 800.0;
const MINIMUM_WINDOW_HEIGHT: f64 = 600.0;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowGeometry {
    version: u32,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct ScreenBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl ScreenBounds {
    fn from_monitor(monitor: &Monitor) -> Self {
        let scale_factor = monitor.scale_factor();
        let work_area = monitor.work_area();
        let position = work_area.position.to_logical::<f64>(scale_factor);
        let size = work_area.size.to_logical::<f64>(scale_factor);
        Self {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
        }
    }
}

pub(crate) fn restore(window: &WebviewWindow) -> Result<(), String> {
    let path = state_path(window.app_handle())?;
    let Some(saved) = load_from(&path)? else {
        return Ok(());
    };
    let screens = window
        .available_monitors()
        .map_err(|error| format!("사용 가능한 화면을 확인할 수 없습니다: {error}"))?
        .iter()
        .map(ScreenBounds::from_monitor)
        .collect::<Vec<_>>();
    let Some(geometry) = fit_to_screens(saved, &screens) else {
        return Ok(());
    };

    window
        .set_position(Position::Logical(LogicalPosition::new(
            geometry.x, geometry.y,
        )))
        .map_err(|error| format!("창 위치를 복원할 수 없습니다: {error}"))?;
    window
        .set_size(Size::Logical(LogicalSize::new(
            geometry.width,
            geometry.height,
        )))
        .map_err(|error| format!("창 크기를 복원할 수 없습니다: {error}"))?;
    Ok(())
}

pub(crate) fn handle_window_event(window: &Window, event: &WindowEvent) {
    if matches!(event, WindowEvent::CloseRequested { .. }) {
        let _ = save(window);
    }
}

fn save(window: &Window) -> Result<(), String> {
    if window
        .is_minimized()
        .map_err(|error| format!("창 최소화 상태를 확인할 수 없습니다: {error}"))?
        || window
            .is_maximized()
            .map_err(|error| format!("창 최대화 상태를 확인할 수 없습니다: {error}"))?
        || window
            .is_fullscreen()
            .map_err(|error| format!("창 전체화면 상태를 확인할 수 없습니다: {error}"))?
    {
        return Ok(());
    }

    let scale_factor = window
        .scale_factor()
        .map_err(|error| format!("창 배율을 확인할 수 없습니다: {error}"))?;
    let position = window
        .outer_position()
        .map_err(|error| format!("창 위치를 확인할 수 없습니다: {error}"))?
        .to_logical::<f64>(scale_factor);
    let size = window
        .inner_size()
        .map_err(|error| format!("창 크기를 확인할 수 없습니다: {error}"))?
        .to_logical::<f64>(scale_factor);
    let geometry = WindowGeometry {
        version: WINDOW_GEOMETRY_VERSION,
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    };
    if !is_valid(geometry) {
        return Ok(());
    }

    save_to(&state_path(window.app_handle())?, geometry)
}

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(WINDOW_GEOMETRY_FILENAME))
        .map_err(|error| format!("창 상태 저장 경로를 확인할 수 없습니다: {error}"))
}

fn load_from(path: &Path) -> Result<Option<WindowGeometry>, String> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("창 상태를 읽을 수 없습니다: {error}")),
    };
    let geometry = serde_json::from_slice(&bytes)
        .map_err(|error| format!("창 상태 형식을 확인할 수 없습니다: {error}"))?;
    Ok(Some(geometry))
}

fn save_to(path: &Path, geometry: WindowGeometry) -> Result<(), String> {
    let directory = path
        .parent()
        .ok_or_else(|| "창 상태 저장 폴더를 확인할 수 없습니다.".to_owned())?;
    fs::create_dir_all(directory)
        .map_err(|error| format!("창 상태 저장 폴더를 만들 수 없습니다: {error}"))?;
    let bytes = serde_json::to_vec(&geometry)
        .map_err(|error| format!("창 상태를 직렬화할 수 없습니다: {error}"))?;
    let mut temp = Builder::new()
        .prefix(".aster-window-geometry-")
        .tempfile_in(directory)
        .map_err(|error| format!("창 상태 임시 파일을 만들 수 없습니다: {error}"))?;
    temp.write_all(&bytes)
        .map_err(|error| format!("창 상태를 기록할 수 없습니다: {error}"))?;
    temp.as_file_mut()
        .sync_all()
        .map_err(|error| format!("창 상태를 디스크에 반영할 수 없습니다: {error}"))?;
    temp.persist(path)
        .map_err(|error| format!("창 상태를 교체할 수 없습니다: {}", error.error))?;
    Ok(())
}

fn fit_to_screens(geometry: WindowGeometry, screens: &[ScreenBounds]) -> Option<WindowGeometry> {
    if !is_valid(geometry) {
        return None;
    }
    let screen = screens.iter().max_by(|left, right| {
        intersection_area(geometry, **left)
            .partial_cmp(&intersection_area(geometry, **right))
            .unwrap_or(Ordering::Equal)
    })?;
    if intersection_area(geometry, *screen) <= 0.0 {
        return None;
    }

    let width = geometry.width.clamp(
        MINIMUM_WINDOW_WIDTH.min(screen.width),
        screen.width.max(MINIMUM_WINDOW_WIDTH),
    );
    let height = geometry.height.clamp(
        MINIMUM_WINDOW_HEIGHT.min(screen.height),
        screen.height.max(MINIMUM_WINDOW_HEIGHT),
    );
    let maximum_x = (screen.x + screen.width - width).max(screen.x);
    let maximum_y = (screen.y + screen.height - height).max(screen.y);
    Some(WindowGeometry {
        version: WINDOW_GEOMETRY_VERSION,
        x: geometry.x.clamp(screen.x, maximum_x),
        y: geometry.y.clamp(screen.y, maximum_y),
        width,
        height,
    })
}

fn intersection_area(geometry: WindowGeometry, screen: ScreenBounds) -> f64 {
    let left = geometry.x.max(screen.x);
    let top = geometry.y.max(screen.y);
    let right = (geometry.x + geometry.width).min(screen.x + screen.width);
    let bottom = (geometry.y + geometry.height).min(screen.y + screen.height);
    (right - left).max(0.0) * (bottom - top).max(0.0)
}

fn is_valid(geometry: WindowGeometry) -> bool {
    geometry.version == WINDOW_GEOMETRY_VERSION
        && geometry.x.is_finite()
        && geometry.y.is_finite()
        && geometry.width.is_finite()
        && geometry.height.is_finite()
        && geometry.width > 0.0
        && geometry.height > 0.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn geometry(x: f64, y: f64, width: f64, height: f64) -> WindowGeometry {
        WindowGeometry {
            version: WINDOW_GEOMETRY_VERSION,
            x,
            y,
            width,
            height,
        }
    }

    fn screen(x: f64, y: f64, width: f64, height: f64) -> ScreenBounds {
        ScreenBounds {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn preserves_geometry_that_fits_the_saved_screen() {
        let saved = geometry(120.0, 80.0, 1200.0, 800.0);
        assert_eq!(
            fit_to_screens(saved, &[screen(0.0, 0.0, 1728.0, 1080.0)]),
            Some(saved)
        );
    }

    #[test]
    fn fits_oversized_geometry_inside_the_matching_screen() {
        assert_eq!(
            fit_to_screens(
                geometry(-100.0, -50.0, 2200.0, 1400.0),
                &[screen(0.0, 0.0, 1440.0, 900.0)],
            ),
            Some(geometry(0.0, 0.0, 1440.0, 900.0))
        );
    }

    #[test]
    fn chooses_the_screen_with_the_largest_overlap() {
        assert_eq!(
            fit_to_screens(
                geometry(1300.0, 100.0, 1000.0, 700.0),
                &[
                    screen(0.0, 0.0, 1440.0, 900.0),
                    screen(1440.0, 0.0, 1920.0, 1080.0),
                ],
            ),
            Some(geometry(1440.0, 100.0, 1000.0, 700.0))
        );
    }

    #[test]
    fn ignores_geometry_when_its_screen_is_no_longer_available() {
        assert_eq!(
            fit_to_screens(
                geometry(1800.0, 100.0, 1000.0, 700.0),
                &[screen(0.0, 0.0, 1440.0, 900.0)],
            ),
            None
        );
    }

    #[test]
    fn ignores_invalid_or_unsupported_geometry() {
        let mut unsupported = geometry(0.0, 0.0, 1200.0, 800.0);
        unsupported.version = 2;
        assert_eq!(
            fit_to_screens(unsupported, &[screen(0.0, 0.0, 1440.0, 900.0)]),
            None
        );
        assert_eq!(
            fit_to_screens(
                geometry(0.0, 0.0, f64::NAN, 800.0),
                &[screen(0.0, 0.0, 1440.0, 900.0)],
            ),
            None
        );
    }

    #[test]
    fn round_trips_the_versioned_geometry_file() {
        let directory = TempDir::new().unwrap();
        let path = directory.path().join(WINDOW_GEOMETRY_FILENAME);
        let saved = geometry(160.0, 90.0, 1280.0, 820.0);
        save_to(&path, saved).unwrap();
        assert_eq!(load_from(&path).unwrap(), Some(saved));
    }
}
