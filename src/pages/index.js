import { useEffect, useMemo, useState } from "react";
import { FaWhatsapp } from "react-icons/fa";
import { FaTwitter } from "react-icons/fa";
import { FaFacebook } from "react-icons/fa";

/* =========================
   Config
========================= */
const USE_PROXY = true; // set true when using CF Pages Function
const proxyUrl = (url) =>
  USE_PROXY ? `/proxy?url=${encodeURIComponent(url)}` : url;
const LS_KEY = "rss_recent_urls";
const MAX_SAVED_KEY = "rss_max_saved";
const TEXT_MODE_KEY = "rss_text_mode";
const DEFAULT_MAX_SAVED = 10;

/* =========================
   Google Analytics helpers
========================= */
const trackEvent = (eventName, parameters = {}) => {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", eventName, parameters);
  }
};

const trackFeedLoad = (feedUrl, success = true, errorMessage = null) => {
  const domain = feedUrl ? new URL(feedUrl).hostname : "unknown";
  trackEvent("rss_feed_load", {
    feed_url: feedUrl,
    feed_domain: domain,
    success: success,
    error_message: errorMessage,
    event_category: "RSS Reader",
    event_label: domain,
  });
};

const trackFeedInteraction = (action, feedUrl, itemTitle = null) => {
  const domain = feedUrl ? new URL(feedUrl).hostname : "unknown";
  trackEvent("rss_feed_interaction", {
    action: action,
    feed_url: feedUrl,
    feed_domain: domain,
    item_title: itemTitle,
    event_category: "RSS Reader",
    event_label: `${action} - ${domain}`,
  });
};

/* =========================
   Small helpers
========================= */
const t = (parent, sel) => {
  const el = parent.querySelector(sel);
  return el ? (el.textContent || "").trim() : "";
};

const qAllNS = (parent, names = []) => {
  const list = [];
  names.forEach((n) => {
    parent.querySelectorAll(n).forEach((el) => list.push(el));
    parent
      .querySelectorAll(`*[local-name='${n.split(":").pop()}']`)
      .forEach((el) => list.push(el));
  });
  return Array.from(new Set(list));
};

const parseDate = (txt) => {
  try {
    const d = new Date(txt);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

const formatDate = (d) =>
  d
    ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "";

/* =========================
   Media extraction + parsing
========================= */
const extractMedia = (itemEl) => {
  const images = [];
  const videos = [];

  itemEl.querySelectorAll("enclosure").forEach((enc) => {
    const url = enc.getAttribute("url");
    const type = (enc.getAttribute("type") || "").toLowerCase();
    if (!url) return;
    if (type.startsWith("image/")) images.push(url);
    else if (type.startsWith("video/")) videos.push(url);
  });

  qAllNS(itemEl, [
    "media\\:content",
    "media\\:thumbnail",
    "media\\:group",
  ]).forEach((m) => {
    const tag = m.localName.toLowerCase();
    if (tag === "thumbnail") {
      const url = m.getAttribute("url");
      if (url) images.push(url);
    } else if (tag === "content") {
      const url = m.getAttribute("url");
      const type = (m.getAttribute("type") || "").toLowerCase();
      const medium = (m.getAttribute("medium") || "").toLowerCase();
      if (url) {
        if (type.startsWith("image/") || medium === "image") images.push(url);
        else if (type.startsWith("video/") || medium === "video")
          videos.push(url);
      }
    } else if (tag === "group") {
      m.querySelectorAll("*").forEach((mc) => {
        const url = mc.getAttribute && mc.getAttribute("url");
        const type =
          (mc.getAttribute && (mc.getAttribute("type") || "").toLowerCase()) ||
          "";
        if (url) {
          if (type.startsWith("image/")) images.push(url);
          else if (type.startsWith("video/")) videos.push(url);
        }
      });
    }
  });

  const html =
    t(itemEl, "content\\:encoded") ||
    t(itemEl, "encoded") ||
    t(itemEl, "description");
  if (html) {
    const div = document.createElement("div");
    div.innerHTML = html;

    div.querySelectorAll("img[src]").forEach((img) => {
      const src = img.getAttribute("src");
      if (src) images.push(src);
    });

    div.querySelectorAll("video source[src], video[src]").forEach((v) => {
      const src = v.getAttribute("src");
      if (src) videos.push(src);
    });

    div.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (/\.(mp4|m3u8|webm)(\?|$)/i.test(href)) videos.push(href);
      if (/youtube\.com|youtu\.be|vimeo\.com/i.test(href)) videos.push(href);
    });
  }

  const uniq = (arr) => Array.from(new Set(arr));
  return { images: uniq(images), videos: uniq(videos) };
};

const extractItem = (itemEl, feedLink) => {
  const title = t(itemEl, "title") || "(untitled)";
  const link = t(itemEl, "link") || t(itemEl, "guid") || feedLink || "";
  const pubDate =
    t(itemEl, "pubDate") ||
    t(itemEl, "published") ||
    t(itemEl, "updated") ||
    "";
  const date = parseDate(pubDate);
  const author =
    t(itemEl, "author name") ||
    t(itemEl, "dc\\:creator") ||
    t(itemEl, "author") ||
    "";

  const contentHTML =
    t(itemEl, "content\\:encoded") ||
    t(itemEl, "encoded") ||
    t(itemEl, "content") ||
    t(itemEl, "summary") ||
    t(itemEl, "description") ||
    "";

  const { images, videos } = extractMedia(itemEl);
  const thumbnail = images.length ? images[0] : "";

  return {
    title,
    link,
    author,
    date,
    dateText: date ? formatDate(date) : pubDate,
    contentHTML,
    images,
    videos,
    thumbnail,
  };
};

const parseFeed = (xmlText) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  const isRSS = !!(
    doc.querySelector("rss > channel") || doc.querySelector("rdf\\:RDF")
  );
  const isAtom = !!doc.querySelector("feed");

  const feedTitle = isAtom ? t(doc, "feed > title") : t(doc, "channel > title");
  const feedLink = isAtom
    ? t(doc, "feed > link[href]") || t(doc, "feed > link")
    : t(doc, "channel > link");

  const items = [];
  if (isRSS)
    doc
      .querySelectorAll("item")
      .forEach((it) => items.push(extractItem(it, feedLink)));
  else if (isAtom)
    doc
      .querySelectorAll("entry")
      .forEach((it) => items.push(extractItem(it, feedLink)));
  else throw new Error("Unknown feed format (not RSS/Atom).");

  return { feedTitle: feedTitle || "Feed", items };
};

/* =========================
   Recent URLs (localStorage)
========================= */
const normalizeUrl = (u) => u.trim();

const loadRecent = () => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const getMaxSaved = () => {
  try {
    const saved = localStorage.getItem(MAX_SAVED_KEY);
    const num = saved ? parseInt(saved, 10) : DEFAULT_MAX_SAVED;
    return isNaN(num) || num < 1 ? DEFAULT_MAX_SAVED : Math.min(num, 50);
  } catch {
    return DEFAULT_MAX_SAVED;
  }
};

const saveRecent = (url) => {
  const norm = normalizeUrl(url);
  let list = loadRecent().filter(Boolean);
  if (!norm) return list;

  // de-dupe, move to front, clamp length
  const maxSaved = getMaxSaved();
  list = [norm, ...list.filter((x) => x !== norm)].slice(0, maxSaved);
  localStorage.setItem(LS_KEY, JSON.stringify(list));
  return list;
};

const removeRecent = (url) => {
  const list = loadRecent().filter((x) => x !== url);
  localStorage.setItem(LS_KEY, JSON.stringify(list));
  return list;
};

const clearAllRecent = () => {
  localStorage.removeItem(LS_KEY);
  return [];
};

const getTextMode = () => {
  try {
    return localStorage.getItem(TEXT_MODE_KEY) || "plain";
  } catch {
    return "plain";
  }
};

const setTextMode = (mode) => {
  try {
    localStorage.setItem(TEXT_MODE_KEY, mode);
  } catch {
    // ignore
  }
};

/* =========================
   UI
========================= */
const RecentFeeds = ({ recent, onPick, onRemove, onClearAll }) => {
  if (!recent.length) return null;
  return (
    <div className="max-w-5xl mx-auto mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700">Recent Feeds</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {recent.map((u) => (
          <div key={u} className="flex items-center gap-1">
            <button
              onClick={() => onPick(u)}
              className="px-3 py-1.5 rounded-full border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 text-sm shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
              title={u}
            >
              {u.length > 42 ? u.slice(0, 42) + "…" : u}
            </button>
            <button
              onClick={() => onRemove(u)}
              aria-label="Remove saved URL"
              className="px-2 py-1 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const FeedForm = ({
  onSubmit,
  loading,
  onPickRecent,
  recent,
  onRemoveRecent,
  onClearAllRecent,
  maxSaved,
  onMaxSavedChange,
  textMode,
  onTextModeChange,
}) => {
  const [url, setUrl] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) onSubmit(url.trim());
        }}
        className="w-full max-w-5xl mx-auto mb-6"
      >
        <div className="flex gap-3">
          <input
            type="url"
            required
            placeholder="Enter RSS/Atom feed URL (e.g. https://example.com/feed.xml)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 p-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm transition-all duration-200"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-4 rounded-2xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            {loading ? "Loading…" : "Load Feed"}
          </button>
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="px-4 py-4 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-800 shadow-sm hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      </form>

      {showSettings && (
        <div className="max-w-5xl mx-auto mb-6 p-4 bg-white border border-gray-200 rounded-2xl shadow-sm">
          <h3 className="text-sm font-medium text-gray-700 mb-4">Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Max Saved Feeds: {maxSaved}
              </label>
              <input
                type="range"
                min="5"
                max="50"
                value={maxSaved}
                onChange={(e) => onMaxSavedChange(parseInt(e.target.value, 10))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Text Display Mode
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => onTextModeChange("plain")}
                  className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                    textMode === "plain"
                      ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
                      : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"
                  }`}
                >
                  Plain Text
                </button>
                <button
                  onClick={() => onTextModeChange("html")}
                  className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                    textMode === "html"
                      ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
                      : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"
                  }`}
                >
                  HTML
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <RecentFeeds
        recent={recent}
        onPick={onPickRecent}
        onRemove={onRemoveRecent}
        onClearAll={onClearAllRecent}
      />
    </>
  );
};

const ItemCard = ({ item, textMode = "plain", feedUrl = null }) => {
  const [showText, setShowText] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const [showVideos, setShowVideos] = useState(false);

  // --- Decode HTML entities safely ---
  const decodeHtmlEntities = (str = "") => {
    const txt = document.createElement("textarea");
    txt.innerHTML = str;
    return txt.value;
  };

  // Strip HTML tags and decode entities for plain text display inside textarea
  const plainText = item.contentHTML
    ? decodeHtmlEntities(item.contentHTML.replace(/<[^>]+>/g, "").trim())
    : "No content";

  const displayText = textMode === "html" ? item.contentHTML : plainText;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(displayText);
      trackFeedInteraction("text_copy", feedUrl, item.title);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = displayText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      trackFeedInteraction("text_copy", feedUrl, item.title);
    }
  };

  const handleItemClick = () => {
    trackFeedInteraction("item_click", feedUrl, item.title);
  };

  const handleShowText = () => {
    setShowText((v) => !v);
    trackFeedInteraction("show_text", feedUrl, item.title);
  };

  const handleShowImages = () => {
    setShowImages((v) => !v);
    trackFeedInteraction("show_images", feedUrl, item.title);
  };

  const handleShowVideos = () => {
    setShowVideos((v) => !v);
    trackFeedInteraction("show_videos", feedUrl, item.title);
  };

  return (
    <div className="p-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 mb-6">
      <div className="flex gap-4">
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt=""
            className="w-24 h-24 object-cover rounded-sm border border-gray-200 shadow-sm"
            loading="lazy"
          />
        ) : (
          <div className="w-24 h-24 rounded-xl border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-400 bg-gray-50">
            No image
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="text-lg font-semibold leading-snug mb-2">
            <a
              href={item.link}
              target="_blank"
              rel="noreferrer"
              className="hover:underline text-gray-900 hover:text-indigo-600 transition-colors"
              onClick={handleItemClick}
            >
              {item.title}
            </a>
          </div>
          <div className="text-sm text-gray-500 truncate mb-3">
            {item.dateText || "No date"}
            {item.author ? ` • ${item.author}` : ""}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="px-4 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 text-xs font-bold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
              onClick={handleShowText}
            >
              {showText ? "Hide" : "Show"} Text
            </button>
            {item.images.length > 0 && (
              <button
                className="px-4 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 text-xs font-bold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                onClick={handleShowImages}
              >
                {showImages ? "Hide" : "Show"} Images ({item.images.length})
              </button>
            )}
            {item.videos.length > 0 && (
              <button
                className="px-4 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 text-xs font-bold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                onClick={handleShowVideos}
              >
                {showVideos ? "Hide" : "Show"} Videos ({item.videos.length})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* --- Textarea: fixed height 200px with copy button --- */}
      {showText && (
        <div className="mt-6 relative">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">
              {textMode === "html" ? "HTML Content" : "Plain Text Content"}
            </span>
            <button
              onClick={copyToClipboard}
              className="px-3 py-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
            >
              📋 Copy
            </button>
          </div>
          <textarea
            readOnly
            value={displayText || "No content"}
            className="w-full border border-gray-200 rounded-xl p-4 text-sm font-mono text-gray-700 bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            style={{ height: "200px" }}
          />
        </div>
      )}

      {showImages && item.images.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-medium text-gray-600 mb-3">
            Images ({item.images.length})
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {item.images.map((src, i) => (
              <a
                key={i}
                href={src}
                target="_blank"
                rel="noreferrer"
                className="block group"
              >
                <img
                  src={src}
                  alt=""
                  className="w-full h-40 object-cover rounded-xl border border-gray-200 shadow-sm group-hover:shadow-md transition-shadow duration-200"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {showVideos && item.videos.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-medium text-gray-600 mb-3">
            Videos ({item.videos.length})
          </h4>
          <ul className="space-y-2">
            {item.videos.map((v, i) => (
              <li key={i}>
                <a
                  className="inline-flex items-center text-sm text-indigo-600 hover:text-indigo-700 hover:underline transition-colors"
                  href={v}
                  target="_blank"
                  rel="noreferrer"
                >
                  🎥 {v}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// Skeleton loading components
const SkeletonCard = () => (
  <div className="p-6 bg-white border border-gray-200 rounded-2xl shadow-sm mb-6 animate-pulse">
    <div className="flex gap-4">
      <div className="w-24 h-24 bg-gray-200 rounded-xl"></div>
      <div className="flex-1">
        <div className="h-6 bg-gray-200 rounded mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-3"></div>
        <div className="flex gap-2">
          <div className="h-8 w-20 bg-gray-200 rounded-full"></div>
          <div className="h-8 w-24 bg-gray-200 rounded-full"></div>
          <div className="h-8 w-20 bg-gray-200 rounded-full"></div>
        </div>
      </div>
    </div>
  </div>
);

const SkeletonLoader = () => (
  <div className="max-w-5xl mx-auto">
    {Array.from({ length: 5 }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [feedTitle, setFeedTitle] = useState("");
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState([]);
  const [maxSaved, setMaxSaved] = useState(DEFAULT_MAX_SAVED);
  const [textMode, setTextMode] = useState("plain");
  const [lastAttemptedUrl, setLastAttemptedUrl] = useState("");

  useEffect(() => {
    setRecent(loadRecent());
    setMaxSaved(getMaxSaved());
    setTextMode(getTextMode());
  }, []);

  const handlePickRecent = async (url) => {
    trackFeedInteraction("recent_feed_click", url);
    await handleLoad(url);
  };

  const handleRemoveRecent = (url) => {
    setRecent(removeRecent(url));
  };

  const handleClearAllRecent = () => {
    setRecent(clearAllRecent());
    trackEvent("recent_feeds_clear", {
      event_category: "RSS Reader",
    });
  };

  const handleMaxSavedChange = (newMax) => {
    setMaxSaved(newMax);
    localStorage.setItem(MAX_SAVED_KEY, newMax.toString());
    trackEvent("settings_change", {
      setting: "max_saved_feeds",
      value: newMax,
      event_category: "RSS Reader",
    });
    // Trim recent list if needed
    const currentRecent = loadRecent();
    if (currentRecent.length > newMax) {
      const trimmed = currentRecent.slice(0, newMax);
      localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
      setRecent(trimmed);
    }
  };

  const handleTextModeChange = (mode) => {
    setTextMode(mode);
    trackEvent("settings_change", {
      setting: "text_mode",
      value: mode,
      event_category: "RSS Reader",
    });
  };

  const handleRetry = () => {
    if (lastAttemptedUrl) {
      handleLoad(lastAttemptedUrl);
    }
  };

  const handleLoad = async (url) => {
    setError("");
    setItems([]);
    setFeedTitle("");
    setLoading(true);
    setLastAttemptedUrl(url);

    // Track feed load attempt
    trackFeedLoad(url, true);

    try {
      const res = await fetch(proxyUrl(url));
      if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
      const text = await res.text();

      // JSON Feed v1 minimal conversion
      let xml = text;
      try {
        const maybeJson = JSON.parse(text);
        if (maybeJson && maybeJson.items && Array.isArray(maybeJson.items)) {
          xml = jsonFeedToRssXml(maybeJson);
        }
      } catch {
        /* not JSON; keep as XML */
      }

      const { feedTitle, items } = parseFeed(xml);
      setFeedTitle(feedTitle);
      setItems(items);

      // save to recent on success (no duplicates)
      setRecent(saveRecent(url));

      // Track successful feed load
      trackFeedLoad(url, true);
      trackEvent("rss_feed_success", {
        feed_url: url,
        feed_domain: new URL(url).hostname,
        item_count: items.length,
        feed_title: feedTitle,
        event_category: "RSS Reader",
      });
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to load feed.");

      // Track failed feed load
      trackFeedLoad(url, false, e.message);
    } finally {
      setLoading(false);
    }
  };

  const jsonFeedToRssXml = (jf) => {
    const esc = (s = "") =>
      String(s).replace(
        /[<>&'"]/g,
        (c) =>
          ({
            "<": "&lt;",
            ">": "&gt;",
            "&": "&amp;",
            "'": "&apos;",
            '"': "&quot;",
          }[c])
      );
    const items = (jf.items || [])
      .map((it) => {
        const content = it.content_html || it.content_text || "";
        const date = it.date_published || it.date_modified || "";
        const thumb = it.image || it.banner_image || "";
        return `
          <item>
            <title>${esc(it.title || "")}</title>
            <link>${esc(it.url || it.external_url || "")}</link>
            <pubDate>${esc(date)}</pubDate>
            <description>${esc(content)}</description>
            ${
              thumb
                ? `<media:content url="${esc(
                    thumb
                  )}" type="image/jpeg" medium="image" />`
                : ""
            }
          </item>`;
      })
      .join("");
    return `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
        <channel>
          <title>${esc(jf.title || "Feed")}</title>
          ${items}
        </channel>
      </rss>`;
  };

  const headerInfo = useMemo(() => ({ count: items.length }), [items]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Sticky header with blur */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 md:px-0 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-5">
              <h1 className="text-xl md:text-2xl font-semibold text-gray-900">
                RSS Reader with Media Parser
              </h1>
              <ShareButtons />
            </div>
            <a
              className="hidden md:block text-sm text-gray-500 hover:text-indigo-600 transition-colors duration-200 font-medium"
              href="https://validator.w3.org/feed/"
              target="_blank"
              rel="noreferrer"
              title="Validate a feed"
            >
              Validate Feed →
            </a>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 md:px-0 pt-8 pb-16">
        <FeedForm
          onSubmit={handleLoad}
          loading={loading}
          recent={recent}
          onPickRecent={handlePickRecent}
          onRemoveRecent={handleRemoveRecent}
          onClearAllRecent={handleClearAllRecent}
          maxSaved={maxSaved}
          onMaxSavedChange={handleMaxSavedChange}
          textMode={textMode}
          onTextModeChange={handleTextModeChange}
        />

        {/* Error banner with retry */}
        {error && (
          <div className="max-w-5xl mx-auto mb-8 p-4 border border-red-200 bg-red-50 text-red-700 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-red-500">⚠️</span>
                <span className="font-medium">{error}</span>
              </div>
              {lastAttemptedUrl && (
                <button
                  onClick={handleRetry}
                  className="px-4 py-2 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && <SkeletonLoader />}

        {/* Feed content */}
        {!loading && items.length > 0 && (
          <div className="max-w-5xl mx-auto">
            <div className="mb-6 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900 text-lg">
                  {feedTitle}
                </span>
                <span className="ml-2">• {headerInfo.count} items</span>
              </div>
            </div>
            {items.map((it, idx) => (
              <ItemCard
                key={idx}
                item={it}
                textMode={textMode}
                feedUrl={lastAttemptedUrl}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && items.length === 0 && (
          <div className="max-w-5xl mx-auto text-center py-16">
            <div className="text-6xl mb-4">📰</div>
            <h2 className="text-2xl font-semibold text-gray-700 mb-2">
              Welcome to RSS Reader
            </h2>
            <p className="text-gray-500 mb-8 max-w-md mx-auto">
              Enter a feed URL above or click one of your saved feeds to start
              reading. The reader supports RSS, Atom, and JSON Feed formats.
            </p>
            <div className="text-sm text-gray-400">
              Try:{" "}
              <code className="bg-gray-100 px-2 py-1 rounded">
                https://feeds.bbci.co.uk/news/rss.xml
              </code>
            </div>
          </div>
        )}
        <div className="text-sm text-gray-400 mt-16">
          Hosted on Cloudflare Pages, Github repo: aizuikmal/rich-rss-reader
        </div>
      </main>
    </div>
  );
}

function ShareButtons() {
  return (
    <div className="flex items-center justify-center gap-3">
      <div className="flex gap-2">
        <button
          onClick={() => {
            const shareUrl =
              typeof window !== "undefined"
                ? window.location.href
                : "https://rich-rss-reader.pages.dev";
            const shareTitle = "RSS Reader with Media Parser";
            const shareText =
              "RSS reader that parses and shows full text, images, and video links.";
            const url = `https://wa.me/?text=${encodeURIComponent(
              `${shareTitle} - ${shareText} ${shareUrl}`
            )}`;
            window.open(url, "_blank");
            trackEvent("share_whatsapp", {
              event_category: "Social Share",
              event_label: "WhatsApp",
            });
          }}
          className="flex items-center gap-2 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          title="Share on WhatsApp"
        >
          <FaWhatsapp />
        </button>
        <button
          onClick={() => {
            const shareUrl =
              typeof window !== "undefined"
                ? window.location.href
                : "https://rich-rss-reader.pages.dev";
            const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
              shareUrl
            )}`;
            window.open(url, "_blank");
            trackEvent("share_facebook", {
              event_category: "Social Share",
              event_label: "Facebook",
            });
          }}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          title="Share on Facebook"
        >
          <FaFacebook />
        </button>
        <button
          onClick={() => {
            const shareUrl =
              typeof window !== "undefined"
                ? window.location.href
                : "https://rich-rss-reader.pages.dev";
            const shareTitle = "RSS Reader with Media Parser";
            const shareText =
              "RSS reader that parses and shows full text, images, and video links.";
            const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
              `${shareTitle} - ${shareText}`
            )}&url=${encodeURIComponent(shareUrl)}`;
            window.open(url, "_blank");
            trackEvent("share_twitter", {
              event_category: "Social Share",
              event_label: "Twitter",
            });
          }}
          className="flex items-center gap-2 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
          title="Share on Twitter"
        >
          <FaTwitter />
        </button>
      </div>
    </div>
  );
}
