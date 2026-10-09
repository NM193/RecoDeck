// src-tauri/src/formats/xml.rs
// XML for the exports, written by hand so the output is exactly what each DJ
// program expects: one escaping function for attribute values.

/// Text for an XML attribute value: the five entities, line breaks and tabs as
/// character references (an attribute's parser would turn them into spaces),
/// and characters XML 1.0 cannot hold dropped.
pub fn attr(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for c in value.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            '\n' => out.push_str("&#10;"),
            '\r' => out.push_str("&#13;"),
            '\t' => out.push_str("&#9;"),
            c if is_xml_char(c) => out.push(c),
            _ => {}
        }
    }
    out
}

fn is_xml_char(c: char) -> bool {
    matches!(c, '\u{20}'..='\u{D7FF}' | '\u{E000}'..='\u{FFFD}' | '\u{10000}'..='\u{10FFFF}')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_five_entities_are_escaped() {
        assert_eq!(attr(r#"Tom & Jerry <"live"> 'mix'"#), "Tom &amp; Jerry &lt;&quot;live&quot;&gt; &apos;mix&apos;");
    }

    #[test]
    fn line_breaks_and_tabs_survive_as_references() {
        assert_eq!(attr("one\ntwo\r\nthree\tfour"), "one&#10;two&#13;&#10;three&#9;four");
    }

    #[test]
    fn other_control_characters_are_dropped_and_unicode_kept() {
        assert_eq!(attr("a\u{0}b\u{7}c\u{FFFE}d"), "abcd");
        assert_eq!(attr("Čačak 🎧 Ça"), "Čačak 🎧 Ça");
    }
}
