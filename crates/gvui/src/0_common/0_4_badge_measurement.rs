use std::collections::HashMap;
use super::config::CustomLayoutConfig;
use super::types::{NormalizedEdge, Rect};

const MIN_BADGE_WIDTH: f64 = 60.0;
const BADGE_HEIGHT: f64 = 28.0;
const CHAR_WIDTH: f64 = 7.0;
const HORIZONTAL_PADDING: f64 = 24.0;

/// Checks if an edge requires a visual badge based on non-empty label text or cycle flag.
pub fn has_badge(label: Option<&str>, is_cycle: bool) -> bool {
    let has_label_text = label.is_some_and(|l| !l.trim().is_empty());
    has_label_text || is_cycle
}

/// Constructs formatted display text string for an edge badge, inserting cycle indicator `↺` if cyclic.
pub fn get_badge_display_text(label: Option<&str>, is_cycle: bool) -> Option<String> {
    if !has_badge(label, is_cycle) {
        return None;
    }
    let trimmed_label = label.map_or("", |l| l.trim());
    if is_cycle {
        if !trimmed_label.is_empty() {
            Some(format!("↺ {}", trimmed_label))
        } else {
            Some("↺".to_string())
        }
    } else {
        Some(trimmed_label.to_string())
    }
}

/// Measures the required bounding rectangle dimensions for a badge based on character length and padding.
pub fn measure_badge_rect(
    label: &str,
    _config: &CustomLayoutConfig,
    is_cycle: bool,
) -> Rect {
    let display_text = get_badge_display_text(Some(label), is_cycle);
    let Some(text) = display_text else {
        return Rect {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
        };
    };

    let width = MIN_BADGE_WIDTH.max((text.len() as f64) * CHAR_WIDTH + HORIZONTAL_PADDING);
    let height = BADGE_HEIGHT;

    Rect {
        x: 0.0,
        y: 0.0,
        width,
        height,
    }
}

/// Measures bounding rectangles for all edges requiring badges in a graph.
pub fn measure_badge_rects(
    edges: &[NormalizedEdge],
    config: &CustomLayoutConfig,
) -> HashMap<String, Rect> {
    let mut result = HashMap::new();

    for edge in edges {
        if has_badge(edge.label.as_deref(), edge.is_cycle.unwrap_or(false)) {
            let rect = measure_badge_rect(
                edge.label.as_deref().unwrap_or(""),
                config,
                edge.is_cycle.unwrap_or(false),
            );
            result.insert(edge.id.clone(), rect);
        }
    }

    result
}
