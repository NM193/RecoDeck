//! Work the user started keeps its speed while the app is out of sight. On
//! macOS, App Nap slows a process down when its window is hidden or the
//! screen is off. A library analysis on 2026-10-18 fell from about 280 tracks
//! a minute to about 75 partway through, on the same kind of tracks, most
//! likely for this reason. The activity also keeps the Mac from idle sleep
//! until the work ends; the display may still sleep.

/// Held while the work runs; dropping it ends the activity.
pub struct UserActivity {
    #[cfg(target_os = "macos")]
    token: objc2::rc::Retained<objc2::runtime::ProtocolObject<dyn objc2::runtime::NSObjectProtocol>>,
}

impl UserActivity {
    /// Starts the activity; `reason` is what macOS shows for it (`pmset -g assertions`).
    pub fn begin(reason: &str) -> Self {
        #[cfg(target_os = "macos")]
        {
            use objc2_foundation::{NSActivityOptions, NSProcessInfo, NSString};
            let token = NSProcessInfo::processInfo()
                .beginActivityWithOptions_reason(NSActivityOptions::UserInitiated, &NSString::from_str(reason));
            Self { token }
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = reason;
            Self {}
        }
    }
}

#[cfg(target_os = "macos")]
impl Drop for UserActivity {
    fn drop(&mut self) {
        // SAFETY: the token is the one `beginActivityWithOptions_reason` returned.
        unsafe { objc2_foundation::NSProcessInfo::processInfo().endActivity(&self.token) };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_activity_begins_and_ends_more_than_once() {
        let first = UserActivity::begin("RecoDeck test");
        let second = UserActivity::begin("RecoDeck test");
        drop(first);
        drop(second);
        drop(UserActivity::begin("RecoDeck test"));
    }
}
