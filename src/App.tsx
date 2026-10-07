import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FolderOpen,
  Search,
  Download,
  Copy,
  Check,
  Play,
  Pause,
  RefreshCw,
  FileCode,
  Terminal,
  Cpu,
  ExternalLink,
  X,
  Clock,
  SlidersHorizontal,
  Trash2,
  Info,
  List,
  LayoutGrid,
  Bookmark,
  Plus,
} from 'lucide-react';
import {
  MAIN_CPP_SOURCE,
  BUILD_BAT_SOURCE,
  GITHUB_WORKFLOW_SOURCE,
  createSelfExtractingLauncherBat,
  toWindowsCrLf,
  SIMULATED_FOLDERS,
  PC_WIDE_CATALOG_FILES,
  SimulatedImageFile,
} from './data/projectFiles';

type ActiveSection = 'workbench' | 'simulator' | 'architecture';
type ActiveCodeTab = 'main.cpp' | 'build.bat' | 'github_workflow';

// Version policy: Bump by 1 on every change made
const PEPPERLIB_VERSION = '1.1';

interface CachedMtimeEntry {
  mtimeTicks: number;
  indexedAt: string;
}

interface ColumnConfig {
  id: 'name' | 'location' | 'size' | 'created' | 'modified' | 'type' | 'ocr';
  label: string;
  visible: boolean;
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: 'name', label: 'Name', visible: true },
  { id: 'location', label: 'Location', visible: true },
  { id: 'size', label: 'Size', visible: true },
  { id: 'created', label: 'Date created', visible: true },
  { id: 'modified', label: 'Date modified', visible: true },
  { id: 'type', label: 'Type', visible: true },
  { id: 'ocr', label: 'OCR / content', visible: true },
];

const DEFAULT_ENABLED_FORMATS: Record<string, boolean> = {
  '<DIR>': true,
  '.png': true,
  '.jpg': true,
  '.webp': true,
  '.bmp': true,
  '.pdf': true,
  '.txt': true,
  '.md': true,
  '.csv': true,
  '.json': true,
};

function PepperLibIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      <rect x="2" y="2" width="60" height="60" rx="12" fill="#DC2626" />
      <rect
        x="10"
        y="12"
        width="32"
        height="27"
        rx="2.5"
        stroke="#FFFFFF"
        strokeWidth="3.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="18.5" cy="19.5" r="2.8" stroke="#FFFFFF" strokeWidth="3" />
      <path
        d="M13 35L22.5 25L31 32.5"
        stroke="#FFFFFF"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="41" cy="39" r="13.5" fill="#DC2626" />
      <circle cx="41" cy="39" r="10" stroke="#FFFFFF" strokeWidth="4" />
      <path
        d="M48.5 46.5L56 54"
        stroke="#FFFFFF"
        strokeWidth="4.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function buildFts5QueryPreview(
  rawInput: string,
  excludeFilename: boolean,
  excludeContent: boolean
): string {
  if (excludeFilename && excludeContent) return '__NONE__';
  const tokens = rawInput
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  if (tokens.length === 0) return '';

  let prefix = '';
  if (excludeFilename && !excludeContent) prefix = 'ocr_text : ';
  else if (excludeContent && !excludeFilename) prefix = 'filename : ';

  return tokens.map((t) => `${prefix}"${t}"*`).join(' AND ');
}

export default function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('workbench');
  const [activeCodeTab, setActiveCodeTab] = useState<ActiveCodeTab>('main.cpp');
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  // Win32 PepperLib Simulator State (Persists previously selected folder via localStorage + %APPDATA%\pepperlib)
  const folderKeys = Object.keys(SIMULATED_FOLDERS);
  const [foldersData, setFoldersData] = useState<Record<string, SimulatedImageFile[]>>(SIMULATED_FOLDERS);
  const [pcCatalogFiles, setPcCatalogFiles] = useState<SimulatedImageFile[]>(PC_WIDE_CATALOG_FILES);
  const [startOnPrevPath, setStartOnPrevPath] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('pepperlib_start_on_prev_path_v2');
      if (saved !== null) return saved === '1';
    } catch {
      // ignore
    }
    return false; // 'Start on previously opened path' is OFF by default
  });
  const [selectedFolder, setSelectedFolder] = useState<string>(() => {
    try {
      const startPrev = localStorage.getItem('pepperlib_start_on_prev_path_v2');
      if (startPrev !== '1') return ''; // Starts on Home (empty path) by default
      const saved = localStorage.getItem('pepperlib_last_folder');
      if (saved !== null) return saved;
    } catch {
      // ignore storage errors
    }
    return '';
  });
  const [rawPathInput, setRawPathInput] = useState<string>(() => {
    try {
      const startPrev = localStorage.getItem('pepperlib_start_on_prev_path_v2');
      if (startPrev !== '1') return '';
      const saved = localStorage.getItem('pepperlib_last_folder');
      if (saved !== null) return saved;
    } catch {
      // ignore
    }
    return '';
  });
  const [showFolderPickerModal, setShowFolderPickerModal] = useState(false);

  // Bookmarks State (Persisted in %APPDATA%\pepperlib\settings.ini & SQLite app_kv)
  const [bookmarks, setBookmarks] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('pepperlib_bookmarks');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [...folderKeys];
  });
  const [showBookmarkMenu, setShowBookmarkMenu] = useState(false);

  // Debounced Search Input State (250ms delay as in main.cpp WM_TIMER)
  const [rawSearchInput, setRawSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isDebouncing, setIsDebouncing] = useState(false);

  // Option Dropdown State (Reverted to dropdown; AppData info & View buttons moved to bottom-left; Dark mode removed)
  const [showOptionDropdown, setShowOptionDropdown] = useState(false);
  const [showOcrAllWarningModal, setShowOcrAllWarningModal] = useState(false);
  const [enabledFormats, setEnabledFormats] = useState<Record<string, boolean>>(DEFAULT_ENABLED_FORMATS);
  const [showFormatFilterModal, setShowFormatFilterModal] = useState(false);
  const [excludeSubfolder, setExcludeSubfolder] = useState(true); // 'Exclude sub-folder' is ON by default
  const [excludeFilename, setExcludeFilename] = useState(false);
  const [excludeContent, setExcludeContent] = useState(false);
  const [excludeWinImportantFiles, setExcludeWinImportantFiles] = useState(true); // 'Exclude windows important file' is ON by default
  const [detailsView, setDetailsView] = useState<boolean>(false); // In Home and Folder views, use Thumbnail View by default
  const [sortColumnId, setSortColumnId] = useState<ColumnConfig['id']>('name');
  const [sortAscending, setSortAscending] = useState(true);
  const [thumbSize, setThumbSize] = useState<number>(96);
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [showAppDataExplorerModal, setShowAppDataExplorerModal] = useState(false);
  const [fileLocationExplorerItem, setFileLocationExplorerItem] = useState<SimulatedImageFile | null>(null);

  // Context Menus (Right-Click Item Context Menu & Right-Click Column Header Bar Menu)
  const [itemContextMenu, setItemContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [headerContextMenu, setHeaderContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [propertiesModalItem, setPropertiesModalItem] = useState<SimulatedImageFile | null>(null);
  const [multiPickerSelection, setMultiPickerSelection] = useState<Set<string>>(() => new Set([folderKeys[0]]));

  // Multi-select (Ctrl+Click) & Range-select (Shift+Click) State
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(() => new Set([0]));
  const [anchorIndex, setAnchorIndex] = useState<number>(0);
  const [openedPhotoModal, setOpenedPhotoModal] = useState<SimulatedImageFile | null>(null);
  const [notepadModalItem, setNotepadModalItem] = useState<SimulatedImageFile | null>(null);
  const [renameModalItem, setRenameModalItem] = useState<SimulatedImageFile | null>(null);
  const [renameInputValue, setRenameInputValue] = useState<string>('');
  const [greenProgressPct, setGreenProgressPct] = useState<number>(100);
  const [greenProgressLabel, setGreenProgressLabel] = useState<string>('100% ready');
  const [navHistory, setNavHistory] = useState<string[]>(() => [selectedFolder]);
  const [navHistoryIdx, setNavHistoryIdx] = useState<number>(0);

  // Simulated SQLite file_catalog, thumb_cache & image_fts in %appdata%\PepperLib\pepperlib_cache.db
  const [sqliteMtimeCache, setSqliteMtimeCache] = useState<Record<string, CachedMtimeEntry>>(() => {
    try {
      const saved = localStorage.getItem('pepperlib_appdata_cache_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // ignore
    }
    const initial: Record<string, CachedMtimeEntry> = {};
    const firstFolder = SIMULATED_FOLDERS[folderKeys[0]] || [];
    firstFolder.slice(0, 5).forEach((item) => {
      initial[item.fullPath] = {
        mtimeTicks: item.lastWriteTimeTicks,
        indexedAt: 'Cached in %appdata%\\PepperLib\\pepperlib_cache.db',
      };
    });
    return initial;
  });

  // Persist sqliteMtimeCache (simulating %appdata%\PepperLib\pepperlib_cache.db)
  useEffect(() => {
    try {
      localStorage.setItem('pepperlib_appdata_cache_v1', JSON.stringify(sqliteMtimeCache));
    } catch {
      // ignore
    }
  }, [sqliteMtimeCache]);

  // Simulated std::jthread Worker & Always-Available Pause/Resume State
  const [isScanning, setIsScanning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const [pcIndexedCount, setPcIndexedCount] = useState(28450);
  const [statusBarText, setStatusBarText] = useState(
    'Home — select a folder or type in the search bar.'
  );

  const scanTimerRef = useRef<number | null>(null);

  // Persist selectedFolder whenever it changes (if non-empty, also remember as last opened path)
  useEffect(() => {
    try {
      if (selectedFolder.trim()) {
        localStorage.setItem('pepperlib_last_folder', selectedFolder);
      }
    } catch {
      // ignore
    }
  }, [selectedFolder]);

  // Persist startOnPrevPath whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('pepperlib_start_on_prev_path_v2', startOnPrevPath ? '1' : '0');
    } catch {
      // ignore
    }
  }, [startOnPrevPath]);

  // Persist bookmarks whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('pepperlib_bookmarks', JSON.stringify(bookmarks));
    } catch {
      // ignore
    }
  }, [bookmarks]);

  // Close floating menus on outside click
  useEffect(() => {
    const closeMenus = () => {
      setItemContextMenu(null);
      setHeaderContextMenu(null);
      setShowBookmarkMenu(false);
      setShowOptionDropdown(false);
    };
    window.addEventListener('click', closeMenus);
    return () => window.removeEventListener('click', closeMenus);
  }, []);

  // 250ms Debounce Effect for Search Input
  useEffect(() => {
    if (rawSearchInput === debouncedQuery) {
      setIsDebouncing(false);
      return;
    }
    setIsDebouncing(true);
    const timer = window.setTimeout(() => {
      setDebouncedQuery(rawSearchInput);
      setIsDebouncing(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [rawSearchInput, debouncedQuery]);

  // Trigger simulated std::jthread background scan (Loads thumbnails first, then runs OCR only on modified files)
  const triggerBackgroundScan = (
    folderPath: string,
    currentFolders = foldersData,
    currentCache = sqliteMtimeCache,
    exclSub = excludeSubfolder,
    fmtFilter = enabledFormats,
    exclWin = excludeWinImportantFiles
  ) => {
    if (scanTimerRef.current) {
      window.clearInterval(scanTimerRef.current);
    }

    const trimmed = folderPath.trim();
    if (!trimmed) {
      setIsScanning(false);
      setStatusBarText('Home — select a folder or type in the search bar.');
      return;
    }

    // Support semicolon-separated multi-selected folders
    const parts = trimmed
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);

    const matchedKeys: string[] = [];
    parts.forEach((part) => {
      const m =
        Object.keys(currentFolders).find((k) => k.toLowerCase() === part.toLowerCase()) ||
        Object.keys(currentFolders).find((k) => k.toLowerCase().startsWith(part.toLowerCase()));
      if (m && !matchedKeys.includes(m)) matchedKeys.push(m);
    });

    if (matchedKeys.length === 0) {
      setIsScanning(false);
      setStatusBarText(
        `Typed path "${trimmed}" filtered against PC-wide catalog (0.2ms UI response, zero freeze).`
      );
      return;
    }

    const allFiles: SimulatedImageFile[] = [];
    matchedKeys.forEach((k) => {
      (currentFolders[k] || []).forEach((f) => allFiles.push(f));
    });

    const files = allFiles.filter(
      (f) =>
        (!exclSub || !f.isSubfolder) &&
        (!exclWin || !f.isWindowsImportantFile) &&
        fmtFilter[f.extension] !== false
    );
    const total = files.length;
    if (total === 0) {
      setIsScanning(false);
      setStatusBarText('Folder contains 0 matching files for current Format/Sub-folder filters.');
      return;
    }

    const updatedCache = { ...currentCache };
    const modifiedFiles = files.filter((f) => {
      const existing = updatedCache[f.fullPath];
      return !(existing && existing.mtimeTicks === f.lastWriteTimeTicks);
    });
    const cachedCount = total - modifiedFiles.length;

    // If no files were modified since last scan, skip OCR and filename re-indexing immediately!
    if (modifiedFiles.length === 0) {
      setIsScanning(false);
      setGreenProgressPct(100);
      setGreenProgressLabel('100% ready');
      setStatusBarText(
        `Loaded ${total} thumbnail(s) from %appdata%\\PepperLib | all ${cachedCount} file(s) unmodified — skipped OCR`
      );
      return;
    }

    setIsScanning(true);
    let idx = 0;
    const modTotal = modifiedFiles.length;
    setGreenProgressPct(Math.max(10, Math.round((cachedCount / Math.max(1, total)) * 100)));
    setGreenProgressLabel(`Loading thumbnails first...`);

    setStatusBarText(
      isPausedRef.current
        ? `[Paused] Loaded thumbnails first — queued OCR for ${modTotal} new/modified file(s)...`
        : `Step 1/2: loaded all ${total} thumbnail(s) first (${cachedCount} unmodified skipped) -> starting OCR on ${modTotal} modified file(s)...`
    );

    scanTimerRef.current = window.setInterval(() => {
      if (isPausedRef.current) {
        return; // Cooperative wait on std::condition_variable pauseCv
      }

      if (idx >= modTotal) {
        if (scanTimerRef.current) window.clearInterval(scanTimerRef.current);
        setIsScanning(false);
        setGreenProgressPct(100);
        setGreenProgressLabel('100% ready');
        setSqliteMtimeCache(updatedCache);
        setStatusBarText(
          `OCR complete: ${total} file(s) ready (${modTotal} newly OCR'd, ${cachedCount} unmodified skipped) | saved in %appdata%\\PepperLib`
        );
        return;
      }

      const file = modifiedFiles[idx];
      updatedCache[file.fullPath] = {
        mtimeTicks: file.lastWriteTimeTicks,
        indexedAt: new Date().toLocaleTimeString(),
      };

      idx++;
      const pct = Math.min(99, Math.max(12, Math.round((idx / modTotal) * 100)));
      setGreenProgressPct(pct);
      setGreenProgressLabel(`OCR ${pct}% (${idx}/${modTotal})`);
      setStatusBarText(
        `Step 2/2: OCR indexing modified files [${idx}/${modTotal}] (unmodified skipped: ${cachedCount}) - ${file.fileName}`
      );
    }, 180);
  };

  // Switch or type folder path helper:
  // - Empty path ("Home") -> show nothing in Home until search is entered
  // - Folder selected -> switch to Medium Thumbnail View (96px, LVS_ICON)
  const applyFolderSelection = (nextPath: string, updateInput = true, pushHistory = true) => {
    const trimmed = nextPath.trim();
    if (updateInput) setRawPathInput(nextPath);
    setSelectedFolder(nextPath);
    setSelectedIndices(new Set([0]));
    if (pushHistory) {
      setNavHistory((prev) => {
        const sliced = prev.slice(0, navHistoryIdx + 1);
        if (sliced[sliced.length - 1]?.toLowerCase() === trimmed.toLowerCase()) {
          return sliced;
        }
        const updated = [...sliced, trimmed];
        setNavHistoryIdx(updated.length - 1);
        return updated;
      });
    }
    // In Home AND Folder view, use Thumbnail View!
    setDetailsView(false);
    if (trimmed) {
      setThumbSize(96);
    }
    triggerBackgroundScan(nextPath);
  };

  const handleNavBack = () => {
    if (navHistoryIdx <= 0) return;
    const nextIdx = navHistoryIdx - 1;
    setNavHistoryIdx(nextIdx);
    const target = navHistory[nextIdx] || '';
    applyFolderSelection(target, true, false);
  };

  const handleNavForward = () => {
    if (navHistoryIdx + 1 >= navHistory.length) return;
    const nextIdx = navHistoryIdx + 1;
    setNavHistoryIdx(nextIdx);
    const target = navHistory[nextIdx] || '';
    applyFolderSelection(target, true, false);
  };

  const handleNavUp = () => {
    const current = selectedFolder.trim();
    if (!current) return;
    const firstPart = current.split(';')[0].trim().replace(/\\+$/, '');
    const lastSlash = firstPart.lastIndexOf('\\');
    if (lastSlash <= 2) {
      applyFolderSelection('', true, true);
      setStatusBarText('Up one level -> Home');
      return;
    }
    const parentPath = firstPart.slice(0, lastSlash);
    applyFolderSelection(parentPath, true, true);
    setStatusBarText(`Up one level -> ${parentPath}`);
  };

  // Bookmark handlers ("Add current path" and "Add custom path" + typeable bookmarked paths)
  const handleAddCurrentFolderToBookmark = () => {
    const candidate = (rawPathInput || selectedFolder).trim();
    if (!candidate) {
      setStatusBarText('Type or select a folder path first, or click "Add custom path".');
      return;
    }
    if (bookmarks.some((b) => b.toLowerCase() === candidate.toLowerCase())) {
      setStatusBarText(`Already bookmarked: ${candidate}`);
      return;
    }
    setBookmarks((prev) => [candidate, ...prev]);
    setStatusBarText(`Added current path to bookmarks: ${candidate}`);
  };

  const handleAddCustomBookmark = () => {
    setBookmarks((prev) => ['C:\\Custom_Folder_Path', ...prev]);
    setStatusBarText('Added custom bookmark row — type any path directly in the bookmark box.');
  };

  const handleUpdateBookmarkPath = (index: number, nextValue: string) => {
    setBookmarks((prev) => prev.map((item, idx) => (idx === index ? nextValue : item)));
  };

  const handleCopyBookmark = (targetPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(targetPath);
    setStatusBarText(`Copied bookmark path to clipboard: ${targetPath}`);
  };

  const handleDeleteBookmarkIndex = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const removed = bookmarks[index];
    setBookmarks((prev) => prev.filter((_, idx) => idx !== index));
    setStatusBarText(`Removed bookmark: ${removed}`);
  };

  // Refresh button handler: Re-indexes filenames & folders ONLY without running OCR
  const handleRefreshFilenamesOnly = () => {
    if (scanTimerRef.current) {
      window.clearInterval(scanTimerRef.current);
    }
    setIsScanning(false);
    setPcIndexedCount((prev) => prev + 12);
    const trimmed = selectedFolder.trim();
    if (trimmed) {
      setStatusBarText(
        `Refreshed filenames & folders in "${trimmed}" (filename-only scan — zero OCR executed).`
      );
    } else {
      setStatusBarText(
        `Refreshing PC-wide filenames & folders across drives (filename-only scan — zero OCR executed)...`
      );
    }
  };

  useEffect(() => {
    triggerBackgroundScan(selectedFolder);
    return () => {
      if (scanTimerRef.current) window.clearInterval(scanTimerRef.current);
    };
  }, []);

  // Pause button is ALWAYS available (enabled 100% of the time)
  const handleTogglePause = () => {
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);
    isPausedRef.current = nextPaused;
    if (nextPaused) {
      setStatusBarText('[Paused] Background indexing and OCR paused. Click "Resume" to continue.');
    } else {
      setStatusBarText('Resumed background indexing and OCR.');
    }
  };

  // Safe throttled "OCR all indexed files" handler (triggered from Option -> OCR all indexed files -> Run anyway)
  const handleRunOcrAllIndexedFiles = () => {
    setShowOcrAllWarningModal(false);
    setPcCatalogFiles((prev) =>
      prev.map((item) =>
        item.extension === '<DIR>'
          ? item
          : {
              ...item,
              isPcCatalogOnly: false,
              ocrText:
                item.ocrText && !item.ocrText.startsWith('[PC Filename Catalog')
                  ? item.ocrText
                  : `Extracted via safe throttled OCR from ${item.fileName} (${item.folder})`,
            }
      )
    );
    setIsScanning(true);
    setStatusBarText(
      'OCR all indexed files running (throttled safe mode: low thread priority, 20ms yield, 40 MB cap)...'
    );
    window.setTimeout(() => {
      setIsScanning(false);
      setStatusBarText(
        `OCR all indexed files complete: safely OCR'd all indexed PC files without freezing Windows.`
      );
    }, 1100);
  };

  // Toggle column sorting on ANY column ribbon click
  const handleColumnSortClick = (colId: ColumnConfig['id'], colLabel: string) => {
    let nextAsc = true;
    if (sortColumnId === colId) {
      nextAsc = !sortAscending;
      setSortAscending(nextAsc);
    } else {
      setSortColumnId(colId);
      setSortAscending(true);
    }
    setStatusBarText(
      `Sorted by ${colLabel}: ${nextAsc ? 'ascending (▲)' : 'descending (▼)'}`
    );
  };

  const simulateModifyFileTimestamp = (fileId: string) => {
    const updatedList = (foldersData[selectedFolder] || []).map((f) => {
      if (f.id !== fileId) return f;
      return {
        ...f,
        lastWriteTimeTicks: f.lastWriteTimeTicks + 95000000,
        lastModifiedHuman: '2026-10-06 09:55 (Modified)',
      };
    });
    const nextFolders = { ...foldersData, [selectedFolder]: updatedList };
    setFoldersData(nextFolders);
    triggerBackgroundScan(selectedFolder, nextFolders, sqliteMtimeCache);
  };

  const clearSqliteCache = () => {
    setSqliteMtimeCache({});
    triggerBackgroundScan(selectedFolder, foldersData, {});
  };

  // Filtered results:
  // - When in "Home" (empty path) and search bar is empty: show nothing.
  // - Search bar ONLY shows results from within the active folder path when a path is active;
  //   ONLY searches globally across the PC when in "Home" (empty path).
  // - Excludes Windows important files (desktop.ini, thumbs.db, C:\Windows\, etc.) when 'Exclude windows important file' is checked.
  // - Sorted by ANY clicked column ribbon (Name, Location, Size, Date created, Date modified, Type, OCR / content).
  const filteredResults = useMemo(() => {
    const trimmedFolder = selectedFolder.trim();
    const lowerFolder = trimmedFolder.toLowerCase();
    const trimmedSearch = debouncedQuery.trim();

    // When in Home (empty path) and no search query is entered, show nothing in Home
    if (!trimmedFolder && !trimmedSearch) {
      return [];
    }

    // Collect items strictly within the active folder path(s) (supports semicolon-separated multi-selected folders)
    let folderFiles: SimulatedImageFile[] = [];
    if (trimmedFolder) {
      const targetFolders = trimmedFolder
        .split(';')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      Object.entries(foldersData).forEach(([folderKey, list]) => {
        const keyLower = folderKey.toLowerCase();
        if (
          targetFolders.some(
            (tf) => keyLower === tf || keyLower.startsWith(tf)
          )
        ) {
          list.forEach((f) => {
            if (
              (!excludeSubfolder || !f.isSubfolder) &&
              (!excludeWinImportantFiles || !f.isWindowsImportantFile) &&
              enabledFormats[f.extension] !== false
            ) {
              folderFiles.push(f);
            }
          });
        }
      });
      // Also match any PC-wide catalog items whose folder is within the active path(s)
      pcCatalogFiles.forEach((pcItem) => {
        const pcFolderLower = pcItem.folder.toLowerCase();
        const matchesAny = targetFolders.some((tf) => {
          const isDirectChild = pcFolderLower === tf;
          const isInSubdir = pcFolderLower.startsWith(tf + '\\');
          return isDirectChild || (!excludeSubfolder && isInSubdir);
        });
        if (
          matchesAny &&
          (!excludeWinImportantFiles || !pcItem.isWindowsImportantFile) &&
          enabledFormats[pcItem.extension] !== false
        ) {
          folderFiles.push(pcItem);
        }
      });
    } else {
      // Empty path ("Home") with a search query -> global search across the entire PC
      Object.values(foldersData).forEach((list) => {
        list.forEach((f) => {
          if (
            (!excludeWinImportantFiles || !f.isWindowsImportantFile) &&
            enabledFormats[f.extension] !== false
          ) {
            folderFiles.push(f);
          }
        });
      });
      pcCatalogFiles.forEach((pcItem) => {
        if (
          (!excludeWinImportantFiles || !pcItem.isWindowsImportantFile) &&
          enabledFormats[pcItem.extension] !== false
        ) {
          folderFiles.push(pcItem);
        }
      });
    }

    // Preserve dots (like "one.png" or "0.png") and alphanumeric tokens so typing the extension finds the exact file!
    const rawTerms = debouncedQuery
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    let results = folderFiles;
    if (rawTerms.length > 0) {
      if (excludeFilename && excludeContent) {
        results = [];
      } else {
        results = folderFiles.filter((file) => {
          const nameLower = file.fileName.toLowerCase();
          const pathLower = file.fullPath.toLowerCase();
          const ocrLower = !file.isPcCatalogOnly ? file.ocrText.toLowerCase() : '';

          return rawTerms.every((term) => {
            const matchName =
              !excludeFilename &&
              (nameLower.includes(term) || (!trimmedFolder && pathLower.includes(term)));
            const matchContent = !excludeContent && ocrLower.includes(term);
            return matchName || matchContent;
          });
        });
      }
    }

    // Sort by active column (sortColumnId) ascending or descending
    return [...results].sort((a, b) => {
      let cmp = 0;
      switch (sortColumnId) {
        case 'name':
          cmp = a.fileName.localeCompare(b.fileName, undefined, { sensitivity: 'base' });
          break;
        case 'location':
          cmp = a.folder.localeCompare(b.folder, undefined, { sensitivity: 'base' });
          break;
        case 'size':
          cmp = a.fileSizeKb - b.fileSizeKb;
          break;
        case 'created':
          cmp = a.dateCreatedHuman.localeCompare(b.dateCreatedHuman);
          break;
        case 'modified':
          cmp = a.lastWriteTimeTicks - b.lastWriteTimeTicks;
          break;
        case 'type':
          cmp = a.extension.localeCompare(b.extension, undefined, { sensitivity: 'base' });
          break;
        case 'ocr':
          cmp = a.ocrText.localeCompare(b.ocrText, undefined, { sensitivity: 'base' });
          break;
      }
      if (cmp === 0) {
        cmp = a.fileName.localeCompare(b.fileName, undefined, { sensitivity: 'base' });
      }
      return sortAscending ? cmp : -cmp;
    });
  }, [
    foldersData,
    pcCatalogFiles,
    selectedFolder,
    debouncedQuery,
    excludeSubfolder,
    excludeFilename,
    excludeContent,
    excludeWinImportantFiles,
    enabledFormats,
    sortColumnId,
    sortAscending,
  ]);

  // Ctrl + A keyboard shortcut to select all items & F2 shortcut to rename selected item
  useEffect(() => {
    if (activeSection !== 'simulator') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputFocused =
        activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

      if (e.key === 'F2' && !isInputFocused) {
        e.preventDefault();
        const sel = Array.from(selectedIndices)
          .map((i) => filteredResults[i])
          .filter(Boolean);
        if (sel.length > 0) {
          setRenameModalItem(sel[0]);
          setRenameInputValue(sel[0].fileName);
        }
        return;
      }

      if (!isInputFocused && selectedIndices.size > 0) {
        const keyLower = e.key.toLowerCase();
        // Ctrl + Shift + C: Copy file path
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && keyLower === 'c') {
          e.preventDefault();
          handleCtxCopyPaths();
          return;
        }
        // Ctrl + C: Copy
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && keyLower === 'c') {
          e.preventDefault();
          handleCtxCopyFiles();
          return;
        }
        // Ctrl + X: Cut
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && keyLower === 'x') {
          e.preventDefault();
          handleCtxCutFiles();
          return;
        }
        // Ctrl + D or Delete: Move to recycle bin
        if (
          ((e.ctrlKey || e.metaKey) && !e.shiftKey && keyLower === 'd') ||
          (!e.ctrlKey && !e.metaKey && e.key === 'Delete')
        ) {
          e.preventDefault();
          handleCtxDelete();
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        if (isInputFocused) {
          return; // Let input boxes select their own text
        }
        e.preventDefault();
        if (filteredResults.length > 0) {
          const allSet = new Set<number>(filteredResults.map((_, idx) => idx));
          setSelectedIndices(allSet);
          setStatusBarText(
            `Selected all ${filteredResults.length} item(s) (Ctrl+A) | Right-click for options or double-click to open`
          );
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeSection, filteredResults, selectedIndices]);

  const fts5QueryString = useMemo(
    () => buildFts5QueryPreview(debouncedQuery, excludeFilename, excludeContent),
    [debouncedQuery, excludeFilename, excludeContent]
  );

  // Handle ListView Item Click with Ctrl+Click (multi-select) and Shift+Click (range select A to B)
  const handleItemClick = (idx: number, e: React.MouseEvent) => {
    if (e.shiftKey) {
      const start = Math.min(anchorIndex, idx);
      const end = Math.max(anchorIndex, idx);
      const nextSet = new Set<number>(e.ctrlKey ? Array.from(selectedIndices) : []);
      for (let i = start; i <= end; i++) {
        nextSet.add(i);
      }
      setSelectedIndices(nextSet);
      setStatusBarText(
        `Selected ${nextSet.size} of ${filteredResults.length} item(s) (Shift+Click range [${start + 1}..${end + 1}])`
      );
    } else if (e.ctrlKey || e.metaKey) {
      const nextSet = new Set<number>(selectedIndices);
      if (nextSet.has(idx)) {
        nextSet.delete(idx);
      } else {
        nextSet.add(idx);
      }
      setSelectedIndices(nextSet);
      setAnchorIndex(idx);
      setStatusBarText(
        `Selected ${nextSet.size} of ${filteredResults.length} item(s) (Ctrl+Click multi-select)`
      );
    } else {
      const nextSet = new Set<number>([idx]);
      setSelectedIndices(nextSet);
      setAnchorIndex(idx);
      setStatusBarText(
        `Selected 1 of ${filteredResults.length} item(s) | Right-click for options or Double-click to open`
      );
    }
  };

  // Right-click on an item in the ListView
  const handleItemContextMenu = (idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setHeaderContextMenu(null);
    setShowBookmarkMenu(false);

    if (!selectedIndices.has(idx)) {
      const nextSet = new Set<number>([idx]);
      setSelectedIndices(nextSet);
      setAnchorIndex(idx);
    }
    setItemContextMenu({ x: e.clientX, y: e.clientY });
  };

  // Right-click on the Detailed View column header bar
  const handleHeaderContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setItemContextMenu(null);
    setShowBookmarkMenu(false);
    setHeaderContextMenu({ x: e.clientX, y: e.clientY });
  };

  const toggleColumnVisibility = (colId: ColumnConfig['id']) => {
    if (colId === 'name') return; // Name column stays visible
    setColumns((prev) =>
      prev.map((c) => (c.id === colId ? { ...c, visible: !c.visible } : c))
    );
  };

  // Right-click context menu actions
  const getSelectedItems = (): SimulatedImageFile[] => {
    return Array.from(selectedIndices)
      .map((i) => filteredResults[i])
      .filter(Boolean);
  };

  const handleCtxOpen = () => {
    const items = getSelectedItems();
    if (items.length > 0) {
      if (items[0].extension === '<DIR>') {
        applyFolderSelection(items[0].fullPath, true);
        setStatusBarText(`Opened folder: ${items[0].fullPath}`);
      } else {
        setOpenedPhotoModal(items[0]);
        setStatusBarText(
          `Opened "${items[0].fileName}" above PepperLib (AllowSetForegroundWindow + SetForegroundWindow)`
        );
      }
    }
    setItemContextMenu(null);
  };

  const handleCtxOpenLocation = () => {
    const items = getSelectedItems();
    if (items.length > 0) {
      setFileLocationExplorerItem(items[0]);
      setStatusBarText(
        `Opened File Location above PepperLib (SHOpenFolderAndSelectItems + BringWindowToTop): "${items[0].fullPath}"`
      );
    }
    setItemContextMenu(null);
  };

  const handleCtxCutFiles = () => {
    const items = getSelectedItems();
    if (items.length > 0) {
      const paths = items.map((i) => i.fullPath).join('\r\n');
      handleCopy('clipboard_cut_files', paths);
      setStatusBarText(`Cut ${items.length} item(s) to clipboard (Ctrl + X).`);
    }
    setItemContextMenu(null);
  };

  const handleCtxCopyFiles = () => {
    const items = getSelectedItems();
    if (items.length > 0) {
      const paths = items.map((i) => i.fullPath).join('\r\n');
      handleCopy('clipboard_files', paths);
      setStatusBarText(`Copied ${items.length} item(s) to clipboard (Ctrl + C).`);
    }
    setItemContextMenu(null);
  };

  const handleCtxCopyPaths = () => {
    const items = getSelectedItems();
    if (items.length > 0) {
      const paths = items.map((i) => i.fullPath).join('\r\n');
      handleCopy('clipboard_paths', paths);
      setStatusBarText(`Copied file path(s) to clipboard (Ctrl + Shift + C).`);
    }
    setItemContextMenu(null);
  };

  const handleCtxDelete = () => {
    const items = getSelectedItems();
    if (items.length === 0) return;
    const idsToDelete = new Set(items.map((i) => i.id));

    const nextFolders: Record<string, SimulatedImageFile[]> = {};
    Object.entries(foldersData).forEach(([k, list]) => {
      nextFolders[k] = list.filter((item) => !idsToDelete.has(item.id));
    });
    setFoldersData(nextFolders);
    setPcCatalogFiles((prev) => prev.filter((item) => !idsToDelete.has(item.id)));
    setSelectedIndices(new Set());
    setStatusBarText(`Moved ${items.length} file(s) to Recycle Bin (SHFileOperationW FOF_ALLOWUNDO) & removed from SQLite.`);
    setItemContextMenu(null);
  };

  const handleCtxRename = () => {
    const items = getSelectedItems();
    setItemContextMenu(null);
    if (items.length > 0) {
      setRenameModalItem(items[0]);
      setRenameInputValue(items[0].fileName);
    }
  };

  const handleConfirmRename = () => {
    if (!renameModalItem) return;
    const newName = renameInputValue.trim();
    if (!newName) return;
    const oldName = renameModalItem.fileName;
    const targetId = renameModalItem.id;
    const newFullPath = `${renameModalItem.folder}\\${newName}`;
    const dotIdx = newName.lastIndexOf('.');
    const newExt =
      renameModalItem.extension === '<DIR>'
        ? '<DIR>'
        : dotIdx > 0
        ? newName.slice(dotIdx).toLowerCase()
        : renameModalItem.extension;

    const nextFolders: Record<string, SimulatedImageFile[]> = {};
    Object.entries(foldersData).forEach(([k, list]) => {
      nextFolders[k] = list.map((item) =>
        item.id === targetId
          ? { ...item, fileName: newName, fullPath: newFullPath, extension: newExt }
          : item
      );
    });
    setFoldersData(nextFolders);
    setPcCatalogFiles((prev) =>
      prev.map((item) =>
        item.id === targetId
          ? { ...item, fileName: newName, fullPath: newFullPath, extension: newExt }
          : item
      )
    );
    setRenameModalItem(null);
    setStatusBarText(`Renamed "${oldName}" -> "${newName}"`);
  };

  const handleCtxProperties = () => {
    const items = getSelectedItems();
    if (items.length > 0) {
      setPropertiesModalItem(items[0]);
    }
    setItemContextMenu(null);
  };

  const handleCopy = async (label: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedFile(label);
      setTimeout(() => setCopiedFile(null), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = content;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopiedFile(label);
      setTimeout(() => setCopiedFile(null), 2000);
    }
  };

  const handleDownloadFile = (filename: string, content: string) => {
    const normalized = filename.endsWith('.yml') ? content : toWindowsCrLf(content);
    const blob = new Blob([normalized], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadBothFiles = () => {
    handleDownloadFile('main.cpp', MAIN_CPP_SOURCE);
    setTimeout(() => {
      handleDownloadFile('build.bat', BUILD_BAT_SOURCE);
    }, 250);
  };

  const handleDownloadSingleFileInstaller = () => {
    const batContent = createSelfExtractingLauncherBat();
    handleDownloadFile('Generate_PepperLib_Exe.bat', batContent);
  };

  const highlightSearchTokens = (text: string, query: string) => {
    const tokens = query
      .trim()
      .split(/\s+/)
      .map((t) => t.replace(/[^a-zA-Z0-9_-]/g, ''))
      .filter(Boolean);
    if (tokens.length === 0) return text;

    const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-sky-500/30 text-sky-200 px-0.5 rounded-xs font-medium">
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  const primarySelectedIndex = useMemo(() => {
    if (selectedIndices.size === 0) return null;
    const arr = Array.from(selectedIndices);
    return arr[arr.length - 1];
  }, [selectedIndices]);

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 flex flex-col">
      {/* Top Bar Contract: Zone 1 Brand, Zone 2 Nav Links, Zone 3 Primary Actions */}
      <header className="flex items-center justify-between px-6 py-3.5 border-b border-slate-800 bg-[#0F172A]/95 sticky top-0 z-30">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('workbench');
          }}
          className="text-base font-bold tracking-tight text-white whitespace-nowrap"
        >
          PepperLib v{PEPPERLIB_VERSION}
        </a>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
          <button
            onClick={() => setActiveSection('workbench')}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeSection === 'workbench'
                ? 'text-white underline underline-offset-8 decoration-red-500 decoration-2'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Source &amp; 1-click builder
          </button>
          <button
            onClick={() => setActiveSection('simulator')}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeSection === 'simulator'
                ? 'text-white underline underline-offset-8 decoration-red-500 decoration-2'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            PepperLib Win32 simulator
          </button>
          <button
            onClick={() => setActiveSection('architecture')}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeSection === 'architecture'
                ? 'text-white underline underline-offset-8 decoration-red-500 decoration-2'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Feature matrix &amp; architecture
          </button>
        </nav>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleDownloadBothFiles}
            className="px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Download main.cpp + build.bat
          </button>
          <button
            onClick={handleDownloadSingleFileInstaller}
            className="px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-500 transition-colors whitespace-nowrap flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            1-file PepperLib.exe builder
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-8 space-y-8">
        {/* Hero & Quantitative Engineering Spec Bar */}
        <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-slate-800">
          <div className="space-y-3 max-w-3xl">
            <div className="flex items-center gap-2.5">
              <PepperLibIcon size={32} />
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
                <span>PepperLib.exe v{PEPPERLIB_VERSION}</span>
                <span aria-hidden="true">·</span>
                <span>PC-Wide Filename Catalog + Selected-Folder OCR</span>
                <span aria-hidden="true">·</span>
                <span>Detailed & Icon Views</span>
                <span aria-hidden="true">·</span>
                <span>Right-Click Shell Menu</span>
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white text-balance">
              PepperLib v{PEPPERLIB_VERSION} — High-speed PC filename indexer + selected-folder OCR
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed max-w-2xl">
              Indexes your PC for filenames in the background while strictly running OCR on your selected folder(s), and features a clean single top bar (<code className="text-sky-300 font-mono">[Option ▾] [Pause] [Refresh] [Bookmark ▾] [Browse folder...] [Path][←][→][↑][✕] [Search...][✕]</code>), Windows Explorer Detailed View with clickable OCR/content text preview in Notepad, and full right-click file actions.
            </p>
          </div>

          {/* Segmented Mode Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg self-start lg:self-auto">
            <button
              onClick={() => setActiveSection('workbench')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeSection === 'workbench'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Deliverable Code (main.cpp & build.bat)
            </button>
            <button
              onClick={() => setActiveSection('simulator')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeSection === 'simulator'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Interactive PepperLib Simulator
            </button>
            <button
              onClick={() => setActiveSection('architecture')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeSection === 'architecture'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Feature Verification Matrix
            </button>
          </div>
        </section>

        {/* SECTION 1: DELIVERABLE SOURCE CODE WORKBENCH */}
        {activeSection === 'workbench' && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Sidebar: Turnkey Build Checklist & Quick Actions */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-[#1E293B]/60 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2.5">
                  <PepperLibIcon size={24} />
                  <h2 className="text-base font-semibold text-white">
                    01. Build Standalone PepperLib.exe
                  </h2>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Download <code className="font-mono text-red-300">Generate_PepperLib_Exe.bat</code> (or <code className="font-mono text-sky-300">main.cpp</code> + <code className="font-mono text-sky-300">build.bat</code>) into your folder and double-click it. Because <code className="font-mono text-slate-200">sqlite3.obj</code> is already cached in your folder, it compiles <code className="font-mono text-white">PepperLib.exe</code> in ~2 seconds.
                </p>

                <div className="pt-2 flex flex-col gap-2">
                  <button
                    onClick={handleDownloadSingleFileInstaller}
                    className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-500 text-white font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <Download className="w-4 h-4" />
                    Download 1-File Generate_PepperLib_Exe.bat
                  </button>
                  <button
                    onClick={() => handleDownloadFile('main.cpp', MAIN_CPP_SOURCE)}
                    className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-medium text-xs rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <FileCode className="w-4 h-4 text-sky-400" />
                    Download main.cpp (PepperLib C++20)
                  </button>
                  <button
                    onClick={() => handleDownloadFile('build.bat', BUILD_BAT_SOURCE)}
                    className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-medium text-xs rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    Download build.bat (Auto Icon + Compiler)
                  </button>
                </div>
              </div>

              {/* Summary of All 9 New Upgrades */}
              <div className="bg-[#1E293B]/60 border border-slate-800 rounded-xl p-5 space-y-3">
                <h2 className="text-base font-semibold text-white">
                  02. Latest 9 PepperLib Upgrades Included
                </h2>
                <div className="divide-y divide-slate-800 text-xs">
                  <div className="py-2 flex items-center justify-between gap-2">
                    <span className="text-slate-200 font-medium">1. Persist Previous Folder</span>
                    <code className="font-mono text-sky-300">app_kv + settings.ini</code>
                  </div>
                  <div className="py-2 flex items-center justify-between gap-2">
                    <span className="text-slate-200 font-medium">2. PC-Wide Filename Index</span>
                    <code className="font-mono text-sky-300">PcFilenameScannerWorker</code>
                  </div>
                  <div className="py-2 flex items-center justify-between gap-2">
                    <span className="text-slate-200 font-medium">3. Search Bar [✕] Clear Button</span>
                    <code className="font-mono text-sky-300">IDC_BTN_CLEAR_SEARCH</code>
                  </div>
                  <div className="py-2 flex items-center justify-between gap-2">
                    <span className="text-slate-200 font-medium">4. Right-Click Item Menu</span>
                    <code className="font-mono text-sky-300">Copy CF_HDROP, Delete, Open</code>
                  </div>
                  <div className="py-2 flex items-center justify-between gap-2">
                    <span className="text-slate-200 font-medium">5. Detailed View + Column Menu</span>
                    <code className="font-mono text-sky-300">LVS_REPORT + Header NM_RCLICK</code>
                  </div>
                  <div className="py-2 flex items-center justify-between gap-2">
                    <span className="text-slate-200 font-medium">6. Option Button (Ribbon Removed)</span>
                    <code className="font-mono text-sky-300">IDC_BTN_OPTION (Left of Pause)</code>
                  </div>
                  <div className="py-2 flex items-center justify-between gap-2">
                    <span className="text-slate-200 font-medium">7 & 9. Always-On Pause Button</span>
                    <code className="font-mono text-sky-300">[Option] [Pause] [Browse]</code>
                  </div>
                  <div className="py-2 flex items-center justify-between gap-2">
                    <span className="text-slate-200 font-medium">8. Greyed &quot;search&quot; Placeholder</span>
                    <code className="font-mono text-sky-300">EM_SETCUEBANNER + Subclass</code>
                  </div>
                </div>
              </div>

              {/* Interactive Preview Callout */}
              <div className="bg-[#1E293B]/60 border border-slate-800 rounded-xl p-5 space-y-3">
                <h2 className="text-base font-semibold text-white">
                  03. Test the New Layout & Menus Live
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Try the new <code className="font-mono text-slate-200">[Option ▾] [Pause] [Browse Folder...]</code> bar, switch between Thumbnail and Detailed View, right-click the column header bar to toggle columns, and right-click any file for Copy/Delete/Open Folder.
                </p>
                <button
                  onClick={() => setActiveSection('simulator')}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 font-medium text-xs rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5" />
                  Launch Interactive PepperLib Simulator
                </button>
              </div>
            </div>

            {/* Right Code Viewer Panel */}
            <div className="lg:col-span-8 bg-[#1E293B]/60 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/70">
                <div className="flex items-center gap-1 p-1 bg-slate-950/80 border border-slate-800 rounded-lg">
                  <button
                    onClick={() => setActiveCodeTab('main.cpp')}
                    className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                      activeCodeTab === 'main.cpp'
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    main.cpp
                  </button>
                  <button
                    onClick={() => setActiveCodeTab('build.bat')}
                    className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                      activeCodeTab === 'build.bat'
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    build.bat
                  </button>
                  <button
                    onClick={() => setActiveCodeTab('github_workflow')}
                    className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                      activeCodeTab === 'github_workflow'
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    .github/workflows/build-exe.yml
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      handleCopy(
                        activeCodeTab,
                        activeCodeTab === 'main.cpp'
                          ? MAIN_CPP_SOURCE
                          : activeCodeTab === 'build.bat'
                          ? BUILD_BAT_SOURCE
                          : GITHUB_WORKFLOW_SOURCE
                      )
                    }
                    className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    {copiedFile === activeCodeTab ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Copied {activeCodeTab}
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy {activeCodeTab}
                      </>
                    )}
                  </button>
                  <button
                    onClick={() =>
                      handleDownloadFile(
                        activeCodeTab === 'github_workflow' ? 'build-exe.yml' : activeCodeTab,
                        activeCodeTab === 'main.cpp'
                          ? MAIN_CPP_SOURCE
                          : activeCodeTab === 'build.bat'
                          ? BUILD_BAT_SOURCE
                          : GITHUB_WORKFLOW_SOURCE
                      )
                    }
                    className="px-3 py-1.5 text-xs font-medium text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Save File
                  </button>
                </div>
              </div>

              {activeCodeTab === 'main.cpp' && (
                <div className="overflow-x-auto max-h-[700px] overflow-y-auto p-5 bg-[#0B1120]">
                  <pre className="text-xs font-mono leading-relaxed text-slate-200 select-all">
                    <code>{MAIN_CPP_SOURCE}</code>
                  </pre>
                </div>
              )}

              {activeCodeTab === 'build.bat' && (
                <div className="overflow-x-auto max-h-[700px] overflow-y-auto p-5 bg-[#0B1120]">
                  <pre className="text-xs font-mono leading-relaxed text-emerald-300 select-all">
                    <code>{BUILD_BAT_SOURCE}</code>
                  </pre>
                </div>
              )}

              {activeCodeTab === 'github_workflow' && (
                <div className="overflow-x-auto max-h-[700px] overflow-y-auto p-5 bg-[#0B1120]">
                  <pre className="text-xs font-mono leading-relaxed text-sky-300 select-all">
                    <code>{GITHUB_WORKFLOW_SOURCE}</code>
                  </pre>
                </div>
              )}
            </div>
          </section>
        )}

        {/* SECTION 2: INTERACTIVE PEPPERLIB WIN32 DESKTOP SIMULATOR */}
        {activeSection === 'simulator' && (
          <section className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#1E293B]/60 border border-slate-800 rounded-xl p-4">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-white">
                  Interactive Win32 <code className="font-mono text-red-400">PepperLib.exe</code> Window Simulator
                </h2>
                <p className="text-xs text-slate-300">
                  Click <code className="font-mono text-sky-300">Option</code> to open the standalone Option window (no thumbnail size menu — use <code className="font-mono text-emerald-300">Ctrl + Scroll</code> on the results view to resize thumbnails), use <code className="font-mono text-sky-300">Bookmark ▾</code> to add/remove bookmarked paths with <code className="font-mono text-red-400">✕</code>, or type directly into the <code className="font-mono text-sky-300">Path</code> box and clear it with <code className="font-mono text-red-400">✕</code>.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setDetailsView((prev) => !prev)}
                  className="px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  {detailsView ? (
                    <>
                      <LayoutGrid className="w-3.5 h-3.5" />
                      Switch to thumbnail view
                    </>
                  ) : (
                    <>
                      <List className="w-3.5 h-3.5" />
                      Switch to detailed view
                    </>
                  )}
                </button>
                <button
                  onClick={() => triggerBackgroundScan(selectedFolder)}
                  className="px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isScanning && !isPaused ? 'animate-spin text-sky-400' : ''}`} />
                  Re-scan folder
                </button>
                <button
                  onClick={clearSqliteCache}
                  className="px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-lg transition-colors whitespace-nowrap"
                >
                  Purge %appdata% cache
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Simulated Native Windows Light Mode Win32 PepperLib Window */}
              <div
                onClick={() => {
                  setShowOptionDropdown(false);
                  setShowBookmarkMenu(false);
                  setItemContextMenu(null);
                  setHeaderContextMenu(null);
                }}
                className="lg:col-span-8 rounded-xl border shadow-xl overflow-visible select-none transition-colors bg-[#F8FAFC] text-slate-900 border-slate-400"
              >
                {/* Win32 Title Bar with Red PepperLib Icon */}
                <div className="px-3.5 py-2 flex items-center justify-between border-b rounded-t-xl bg-[#E2E8F0] border-slate-300 text-slate-800">
                  <div className="flex items-center gap-2 text-xs font-semibold truncate">
                    <PepperLibIcon size={18} />
                    <span className="truncate">PepperLib v{PEPPERLIB_VERSION}</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-400 text-xs font-mono">
                    <span>—</span>
                    <span>□</span>
                    <span>×</span>
                  </div>
                </div>

                {/* SINGLE TOP BAR: [Option ▾] -> [Pause] -> [Refresh] -> [Bookmark ▾] -> [Browse folder...] -> [Typeable Path][✕] -> [Search...][✕] */}
                <div className="p-2.5 flex flex-wrap xl:flex-nowrap items-center gap-1.5 border-b relative bg-[#F8FAFC] border-slate-300">
                  {/* 1. IDC_BTN_OPTION (Dropdown popup) */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setItemContextMenu(null);
                        setHeaderContextMenu(null);
                        setShowBookmarkMenu(false);
                        setShowOptionDropdown((prev) => !prev);
                      }}
                      className="px-2.5 py-1.5 rounded-xs text-xs font-semibold border flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer bg-white hover:bg-slate-100 text-slate-900 border-slate-400"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-red-500" />
                      Option ▾
                    </button>

                    {showOptionDropdown && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute left-0 mt-1 w-72 rounded-md shadow-2xl border p-3 z-40 text-xs space-y-2.5 bg-white border-slate-300 text-slate-900"
                      >
                        <button
                          onClick={() => {
                            setShowOptionDropdown(false);
                            setShowFormatFilterModal(true);
                          }}
                          className="w-full py-1.5 px-2.5 border rounded-xs font-semibold text-left flex items-center justify-between cursor-pointer bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-900"
                        >
                          <span>Format filter</span>
                          <SlidersHorizontal className="w-3.5 h-3.5 text-red-500" />
                        </button>

                        <div className="space-y-2 pt-0.5">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={excludeSubfolder}
                              onChange={(e) => {
                                const next = e.target.checked;
                                setExcludeSubfolder(next);
                                triggerBackgroundScan(
                                  selectedFolder,
                                  foldersData,
                                  sqliteMtimeCache,
                                  next,
                                  enabledFormats,
                                  excludeWinImportantFiles
                                );
                              }}
                              className="accent-red-600"
                            />
                            <span>Exclude sub-folder</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={excludeFilename}
                              onChange={(e) => setExcludeFilename(e.target.checked)}
                              className="accent-red-600"
                            />
                            <span>Exclude filename</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={excludeContent}
                              onChange={(e) => setExcludeContent(e.target.checked)}
                              className="accent-red-600"
                            />
                            <span>Exclude content</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={excludeWinImportantFiles}
                              onChange={(e) => {
                                const next = e.target.checked;
                                setExcludeWinImportantFiles(next);
                                setStatusBarText(
                                  next
                                    ? 'Excluded Windows system and shell metadata files (desktop.ini, thumbs.db, C:\\Windows, etc.).'
                                    : 'Showing all files including Windows system files.'
                                );
                              }}
                              className="accent-red-600"
                            />
                            <span>Exclude windows important file</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={startOnPrevPath}
                              onChange={(e) => {
                                const next = e.target.checked;
                                setStartOnPrevPath(next);
                                setStatusBarText(
                                  next
                                    ? 'Option enabled: Start on previously opened path.'
                                    : 'Option disabled: Start on Home (empty path) at launch.'
                                );
                              }}
                              className="accent-red-600"
                            />
                            <span>Start on previously opened path</span>
                          </label>
                        </div>

                        <div className="pt-2 border-t border-slate-200">
                          <button
                            onClick={() => {
                              setShowOptionDropdown(false);
                              setShowOcrAllWarningModal(true);
                            }}
                            className="w-full py-1.5 px-2.5 border rounded-xs font-semibold text-left flex items-center justify-between cursor-pointer bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900"
                          >
                            <span>OCR all indexed files...</span>
                            <Cpu className="w-3.5 h-3.5 text-amber-500" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. IDC_BTN_PAUSE (With hover pop-up: "Pause indexing and OCR (bottom right)") */}
                  <div className="relative group">
                    <button
                      onClick={handleTogglePause}
                      className={`px-2.5 py-1.5 rounded-xs text-xs font-semibold border flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer ${
                        isPaused
                          ? 'bg-amber-500/20 text-amber-700 border-amber-500/50'
                          : 'bg-white hover:bg-slate-100 text-slate-900 border-slate-400'
                      }`}
                    >
                      {isPaused ? (
                        <>
                          <Play className="w-3 h-3" />
                          Resume
                        </>
                      ) : (
                        <>
                          <Pause className="w-3 h-3" />
                          Pause
                        </>
                      )}
                    </button>
                    <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute left-0 top-full mt-1.5 z-50 px-2.5 py-1 rounded-xs shadow-lg border text-[11px] whitespace-nowrap bg-[#252526] text-white border-[#454545]">
                      Pause indexing and OCR (bottom right)
                    </div>
                  </div>

                  {/* 3. IDC_BTN_REFRESH (With hover pop-up: "Refresh filename index (doesn't include OCR)") */}
                  <div className="relative group">
                    <button
                      onClick={handleRefreshFilenamesOnly}
                      className="px-2.5 py-1.5 rounded-xs text-xs font-semibold border flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer bg-white hover:bg-slate-100 text-slate-900 border-slate-400"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-emerald-500" />
                      Refresh
                    </button>
                    <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute left-0 top-full mt-1.5 z-50 px-2.5 py-1 rounded-xs shadow-lg border text-[11px] whitespace-nowrap bg-[#252526] text-white border-[#454545]">
                      Refresh filename index (doesn&apos;t include OCR)
                    </div>
                  </div>

                  {/* 4. IDC_BTN_BOOKMARK */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setItemContextMenu(null);
                        setHeaderContextMenu(null);
                        setShowOptionDropdown(false);
                        setShowBookmarkMenu((prev) => !prev);
                      }}
                      className="px-2.5 py-1.5 rounded-xs text-xs font-semibold border flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer bg-white hover:bg-slate-100 text-slate-900 border-slate-400"
                    >
                      <Bookmark className="w-3.5 h-3.5 text-sky-500" />
                      Bookmark ▾
                    </button>

                    {showBookmarkMenu && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute left-0 mt-1 w-[460px] rounded-md shadow-2xl border p-2 z-40 text-xs bg-white border-slate-300 text-slate-900"
                      >
                        <div className="grid grid-cols-2 gap-1.5 pb-2 border-b border-slate-200">
                          <button
                            onClick={() => {
                              handleAddCurrentFolderToBookmark();
                            }}
                            className="px-2.5 py-1.5 rounded-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer bg-slate-100 hover:bg-slate-200 text-emerald-700 border-slate-300"
                          >
                            <Plus className="w-3.5 h-3.5 shrink-0" />
                            <span>Add current path</span>
                          </button>

                          <button
                            onClick={() => {
                              handleAddCustomBookmark();
                            }}
                            className="px-2.5 py-1.5 rounded-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer bg-slate-100 hover:bg-slate-200 text-sky-700 border-slate-300"
                          >
                            <Plus className="w-3.5 h-3.5 shrink-0" />
                            <span>Add custom path</span>
                          </button>
                        </div>

                        {bookmarks.length === 0 ? (
                          <div className="px-2 py-2.5 text-slate-400">
                            No bookmarked paths yet. Click &quot;Add current path&quot; or &quot;Add custom path&quot; above.
                          </div>
                        ) : (
                          <div className="max-h-60 overflow-y-auto pt-1.5 space-y-1.5">
                            {bookmarks.map((bmPath, bmIdx) => (
                              <div
                                key={bmIdx}
                                className="flex items-center gap-1"
                              >
                                <input
                                  type="text"
                                  value={bmPath}
                                  onChange={(e) => handleUpdateBookmarkPath(bmIdx, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && bmPath.trim()) {
                                      applyFolderSelection(bmPath.trim(), true);
                                      setShowBookmarkMenu(false);
                                    }
                                  }}
                                  placeholder="Type folder path..."
                                  className="flex-1 px-2 py-1 rounded-xs font-mono text-[11px] border focus:outline-none bg-white text-slate-900 border-slate-300 focus:border-sky-600"
                                />
                                <button
                                  onClick={() => {
                                    if (bmPath.trim()) {
                                      applyFolderSelection(bmPath.trim(), true);
                                      setShowBookmarkMenu(false);
                                    }
                                  }}
                                  className="px-2 py-1 rounded-xs text-[11px] font-medium border cursor-pointer shrink-0 bg-slate-100 hover:bg-slate-200 text-sky-700 border-slate-300"
                                >
                                  Open
                                </button>
                                <button
                                  onClick={(e) => handleCopyBookmark(bmPath, e)}
                                  className="px-2 py-1 rounded-xs text-[11px] font-medium border cursor-pointer shrink-0 bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
                                >
                                  Copy
                                </button>
                                <button
                                  onClick={(e) => handleDeleteBookmarkIndex(bmIdx, e)}
                                  className="px-2 py-1 rounded-xs text-xs font-bold border cursor-pointer shrink-0 bg-slate-100 hover:bg-red-100 text-red-600 border-slate-300"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 5. IDC_BTN_BROWSE (Sentence case: "Browse folder...") */}
                  <button
                    onClick={() => setShowFolderPickerModal(true)}
                    className="px-2.5 py-1.5 rounded-xs text-xs font-semibold border flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer bg-white hover:bg-slate-100 text-slate-900 border-slate-400"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
                    Browse folder...
                  </button>

                  {/* 6. Typeable IDC_EDT_PATH (no placeholder text) + [←] [→] [↑] Navigation Buttons + [✕] */}
                  <div className="flex-1 min-w-[190px] flex items-center gap-1">
                    <div className="flex-1 flex items-center px-2.5 py-1.5 border bg-white border-slate-400 focus-within:border-sky-600">
                      <input
                        type="text"
                        value={rawPathInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRawPathInput(val);
                          setSelectedFolder(val);
                          if (!val.trim()) {
                            setDetailsView(true);
                          } else {
                            setDetailsView(false);
                            setThumbSize(96);
                          }
                          triggerBackgroundScan(val);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            applyFolderSelection(rawPathInput, false);
                          }
                        }}
                        className="w-full text-xs focus:outline-none bg-transparent text-slate-900"
                      />
                    </div>

                    <button
                      onClick={handleNavBack}
                      disabled={navHistoryIdx <= 0}
                      title="Back"
                      className="px-2 py-1.5 rounded-xs text-xs font-bold border flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-white hover:bg-slate-100 text-slate-700 border-slate-400"
                    >
                      ←
                    </button>

                    <button
                      onClick={handleNavForward}
                      disabled={navHistoryIdx + 1 >= navHistory.length}
                      title="Forward"
                      className="px-2 py-1.5 rounded-xs text-xs font-bold border flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-white hover:bg-slate-100 text-slate-700 border-slate-400"
                    >
                      →
                    </button>

                    <button
                      onClick={handleNavUp}
                      disabled={!selectedFolder.trim()}
                      title="Up one level"
                      className="px-2 py-1.5 rounded-xs text-xs font-bold border flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-white hover:bg-slate-100 text-slate-700 border-slate-400"
                    >
                      ↑
                    </button>

                    <button
                      onClick={() => {
                        applyFolderSelection('', true);
                        setStatusBarText('Home — Select a folder or type in the search bar.');
                      }}
                      disabled={!rawPathInput}
                      title="Clear folder path and return to Home"
                      className="px-2 py-1.5 rounded-xs text-xs font-bold border flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-white hover:bg-slate-100 text-slate-700 border-slate-400"
                    >
                      ✕
                    </button>
                  </div>

                  {/* 7. IDC_EDT_SEARCH + [✕] */}
                  <div className="flex items-center gap-1 sm:w-56 shrink-0">
                    <div className="flex-1 flex items-center px-2.5 py-1.5 border bg-white border-slate-400 focus-within:border-sky-600">
                      <Search className="w-3.5 h-3.5 text-slate-400 mr-1.5 shrink-0" />
                      <input
                        type="text"
                        value={rawSearchInput}
                        onChange={(e) => setRawSearchInput(e.target.value)}
                        placeholder="Search..."
                        className="w-full text-xs focus:outline-none bg-transparent text-slate-900 placeholder:text-slate-500"
                      />
                      {isDebouncing && (
                        <span
                          className="w-2 h-2 rounded-full bg-amber-400 animate-pulse ml-1"
                          title="250ms debounce active..."
                        />
                      )}
                    </div>

                    <button
                      onClick={() => {
                        setRawSearchInput('');
                        setDebouncedQuery('');
                      }}
                      disabled={!rawSearchInput}
                      title="Clear search bar"
                      className="px-2 py-1.5 rounded-xs text-xs font-bold border flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-white hover:bg-slate-100 text-slate-700 border-slate-400"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Top Green Loading Bar (4px vivid green progress strip directly below the top toolbar) */}
                <div className="w-full h-1.5 bg-emerald-100 overflow-hidden border-b border-emerald-600/30">
                  <div
                    className={`h-full transition-all duration-200 ${
                      isPaused
                        ? 'bg-amber-500'
                        : isScanning
                        ? 'bg-emerald-500'
                        : 'bg-emerald-600'
                    }`}
                    style={{ width: `${greenProgressPct}%` }}
                  />
                </div>

                {/* SysListView32 Viewport: Supports Detailed view (LVS_REPORT) & Thumbnail view (LVS_ICON) */}
                <div
                  onWheel={(e) => {
                    if (e.ctrlKey) {
                      e.preventDefault();
                      const delta = e.deltaY < 0 ? 16 : -16;
                      setDetailsView(false);
                      setThumbSize((prev) => Math.min(240, Math.max(64, prev + delta)));
                    }
                  }}
                  className="min-h-[450px] max-h-[520px] overflow-y-auto border-b transition-colors bg-white border-slate-300"
                >
                  {filteredResults.length === 0 ? (
                    <div className="h-72 flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
                      {!selectedFolder.trim() && !debouncedQuery.trim() ? (
                        <>
                          <p className="text-sm font-medium text-slate-700">
                            Home
                          </p>
                          <p className="text-xs text-slate-500 max-w-md">
                            Select a folder via Browse folder... or Bookmark ▾, or type in the search bar to search across all indexed PC files.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-slate-700">
                            No matching files in SQLite FTS5 / PC catalog
                          </p>
                          <p className="text-xs text-slate-500 max-w-md">
                            {excludeFilename && excludeContent
                              ? 'Both "Exclude filename" and "Exclude content" are checked in Option ▾. Uncheck at least one to search.'
                              : 'Try adjusting your search query or enabling more file types in Option ▾ -> Format filter.'}
                          </p>
                        </>
                      )}
                    </div>
                  ) : detailsView ? (
                    /* DETAILED VIEW (LVS_REPORT) with sorting on ALL columns */
                    <div className="w-full overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr
                            onContextMenu={handleHeaderContextMenu}
                            title="Click any column header to sort; right-click to show or hide columns"
                            className="border-b select-none bg-[#F1F5F9] border-slate-300 text-slate-700"
                          >
                            {columns.map(
                              (col) =>
                                col.visible && (
                                  <th
                                    key={col.id}
                                    onClick={() => handleColumnSortClick(col.id, col.label)}
                                    title={`Click to sort by ${col.label} (right-click to toggle columns)`}
                                    className="py-2 px-3 font-semibold border-r last:border-r-0 whitespace-nowrap cursor-pointer transition-colors border-slate-300 hover:bg-slate-200/70"
                                  >
                                    {col.label}
                                    {sortColumnId === col.id ? (sortAscending ? ' ▲' : ' ▼') : ''}
                                  </th>
                                )
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {filteredResults.map((item, idx) => {
                            const isSelected = selectedIndices.has(idx);
                            return (
                              <tr
                                key={item.id}
                                onClick={(e) => handleItemClick(idx, e)}
                                onContextMenu={(e) => handleItemContextMenu(idx, e)}
                                onDoubleClick={() => {
                                  if (item.extension === '<DIR>') {
                                    applyFolderSelection(item.fullPath, true);
                                  } else {
                                    setOpenedPhotoModal(item);
                                  }
                                }}
                                className={`cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'bg-sky-100 text-slate-900'
                                    : 'hover:bg-slate-50 text-slate-800'
                                }`}
                              >
                                {columns[0].visible && (
                                  <td className="py-1.5 px-3 font-medium whitespace-nowrap flex items-center gap-2">
                                    {item.extension === '<DIR>' ? (
                                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
                                        <path d="M1.5 3.5C1.5 2.94772 1.94772 2.5 2.5 2.5H6.2L7.7 4H13.5C14.0523 4 14.5 4.44772 14.5 5V12.5C14.5 13.0523 14.0523 13.5 13.5 13.5H2.5C1.94772 13.5 1.5 13.0523 1.5 12.5V3.5Z" fill="#FBBF24" stroke="#D97706" strokeWidth="1" />
                                      </svg>
                                    ) : ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.tif'].includes(item.extension.toLowerCase()) ? (
                                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
                                        <rect x="1.5" y="2" width="13" height="12" rx="1.5" fill="#E0F2FE" stroke="#0284C7" strokeWidth="1.1" />
                                        <circle cx="5.2" cy="5.5" r="1.3" fill="#F59E0B" />
                                        <path d="M2.2 12.8L6 8.5L8.8 11.2L10.8 9.2L13.8 12.8H2.2Z" fill="#0EA5E9" />
                                      </svg>
                                    ) : item.extension.toLowerCase() === '.pdf' ? (
                                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
                                        <path d="M3 1.5H10L13 4.5V14.5H3V1.5Z" fill="#FEF2F2" stroke="#DC2626" strokeWidth="1.1" />
                                        <path d="M9.5 1.5V4.8H13" stroke="#DC2626" strokeWidth="1" />
                                        <rect x="4.2" y="8.2" width="7.6" height="4" rx="0.6" fill="#DC2626" />
                                      </svg>
                                    ) : ['.csv', '.tsv', '.xlsx', '.xls'].includes(item.extension.toLowerCase()) ? (
                                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
                                        <path d="M3 1.5H10L13 4.5V14.5H3V1.5Z" fill="#ECFDF5" stroke="#059669" strokeWidth="1.1" />
                                        <rect x="4.5" y="6.5" width="7" height="5.5" stroke="#059669" strokeWidth="1" />
                                        <line x1="8" y1="6.5" x2="8" y2="12" stroke="#059669" strokeWidth="1" />
                                        <line x1="4.5" y1="9.2" x2="11.5" y2="9.2" stroke="#059669" strokeWidth="1" />
                                      </svg>
                                    ) : (
                                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
                                        <path d="M3 1.5H10L13 4.5V14.5H3V1.5Z" fill="#F8FAFC" stroke="#475569" strokeWidth="1.1" />
                                        <path d="M9.5 1.5V4.8H13" stroke="#475569" strokeWidth="1" />
                                        <line x1="5" y1="7" x2="11" y2="7" stroke="#64748B" strokeWidth="1.1" />
                                        <line x1="5" y1="9.5" x2="11" y2="9.5" stroke="#64748B" strokeWidth="1.1" />
                                        <line x1="5" y1="12" x2="8.8" y2="12" stroke="#64748B" strokeWidth="1.1" />
                                      </svg>
                                    )}
                                    <span>{highlightSearchTokens(item.fileName, debouncedQuery)}</span>
                                  </td>
                                )}
                                {columns[1].visible && (
                                  <td className="py-1.5 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                                    {item.folder}
                                  </td>
                                )}
                                {columns[2].visible && (
                                  <td className="py-1.5 px-3 font-mono text-[11px] whitespace-nowrap">
                                    {item.extension === '<DIR>' ? '—' : `${item.fileSizeKb} KB`}
                                  </td>
                                )}
                                {columns[3].visible && (
                                  <td className="py-1.5 px-3 font-mono text-[11px] whitespace-nowrap">
                                    {item.dateCreatedHuman}
                                  </td>
                                )}
                                {columns[4].visible && (
                                  <td className="py-1.5 px-3 font-mono text-[11px] whitespace-nowrap">
                                    {item.lastModifiedHuman}
                                  </td>
                                )}
                                {columns[5].visible && (
                                  <td className="py-1.5 px-3 font-mono text-[11px] whitespace-nowrap">
                                    {item.category}
                                  </td>
                                )}
                                {columns[6].visible && (
                                  <td
                                    onClick={(e) => {
                                      if (item.extension !== '<DIR>') {
                                        e.stopPropagation();
                                        setSelectedIndices(new Set([idx]));
                                        setNotepadModalItem(item);
                                        setStatusBarText(
                                          `Opened OCR / content in Notepad (default .txt editor): ${item.fileName}_ocr.txt`
                                        );
                                      }
                                    }}
                                    title={
                                      item.extension === '<DIR>'
                                        ? 'Folder'
                                        : 'Click to open extracted OCR / content text in Notepad (or default .txt editor)'
                                    }
                                    className="py-1.5 px-3 font-mono text-[11px] max-w-xs truncate hover:underline hover:text-sky-700"
                                  >
                                    {item.extension === '<DIR>' ? (
                                      <span className="text-amber-600 font-medium">[Folder]</span>
                                    ) : item.isPcCatalogOnly ? (
                                      <span className="text-slate-500 italic">
                                        [Click to extract &amp; open OCR text in Notepad]
                                      </span>
                                    ) : (
                                      highlightSearchTokens(item.ocrText, debouncedQuery)
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    /* LARGE ICON THUMBNAIL VIEW (LVS_ICON) */
                    <div className="p-4 flex flex-wrap gap-3.5 items-start">
                      {filteredResults.map((item, idx) => {
                        const isSelected = selectedIndices.has(idx);
                        const cacheInfo = sqliteMtimeCache[item.fullPath];
                        const isCached = cacheInfo && cacheInfo.mtimeTicks === item.lastWriteTimeTicks;

                        return (
                          <div
                            key={item.id}
                            style={{ width: `${Math.max(108, thumbSize + 24)}px` }}
                            onClick={(e) => handleItemClick(idx, e)}
                            onContextMenu={(e) => handleItemContextMenu(idx, e)}
                            onDoubleClick={() => {
                              if (item.extension === '<DIR>') {
                                applyFolderSelection(item.fullPath, true);
                              } else {
                                setOpenedPhotoModal(item);
                              }
                            }}
                            title={`${item.fileName}\nLocation: ${item.folder}\nRight-click for options`}
                            className={`group flex flex-col items-center p-2 rounded-xs border transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-sky-100/90 border-sky-500'
                                : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-200'
                            }`}
                          >
                            <div
                              style={{
                                width: `${thumbSize}px`,
                                height: `${thumbSize}px`,
                                borderTopColor: item.accentColor,
                                borderTopWidth: '3px',
                              }}
                              className="border flex flex-col justify-between p-2 relative overflow-hidden shadow-2xs bg-[#F1F5F9] border-[#CBD5E1]"
                            >
                              <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                                <span
                                  className="px-1 py-0.2 rounded-2xs text-white font-bold"
                                  style={{ backgroundColor: item.accentColor }}
                                >
                                  {item.extension === '<DIR>'
                                    ? 'DIR'
                                    : item.extension.replace('.', '').toUpperCase()}
                                </span>
                                {thumbSize >= 96 && (
                                  <span className="truncate ml-1">
                                    {item.extension === '<DIR>'
                                      ? 'Folder'
                                      : item.isPcCatalogOnly
                                      ? 'PC drive'
                                      : item.isSubfolder
                                      ? 'Subdir'
                                      : 'Folder'}
                                  </span>
                                )}
                              </div>

                              {thumbSize >= 80 && (
                                <div className="my-auto border p-1 text-[8px] leading-tight font-mono line-clamp-3 bg-white border-slate-200 text-slate-700">
                                  {item.extension === '<DIR>'
                                    ? 'Double-click to open folder'
                                    : item.isPcCatalogOnly
                                    ? 'Filename indexed across PC (no OCR run outside selected folder)'
                                    : highlightSearchTokens(item.ocrText, debouncedQuery)}
                                </div>
                              )}

                              <div className="flex items-center justify-between text-[8px] font-mono text-slate-400">
                                <span>{item.extension === '<DIR>' ? 'DIR' : `${item.fileSizeKb}KB`}</span>
                                <span
                                  className={
                                    item.extension === '<DIR>'
                                      ? 'text-amber-600 font-semibold'
                                      : item.isPcCatalogOnly
                                      ? 'text-sky-600 font-semibold'
                                      : isCached
                                      ? 'text-emerald-600 font-semibold'
                                      : 'text-amber-600 font-semibold'
                                  }
                                >
                                  {item.extension === '<DIR>'
                                    ? 'Folder'
                                    : item.isPcCatalogOnly
                                    ? 'Name'
                                    : isCached
                                    ? 'Cached'
                                    : 'New'}
                                </span>
                              </div>
                            </div>

                            <span className="mt-1.5 text-[11px] text-center font-medium break-all line-clamp-2 leading-snug text-slate-800">
                              {highlightSearchTokens(item.fileName, debouncedQuery)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Bottom Bar of PepperLib:
                    Bottom-left: Widened [ⓘ Settings and cache are saved in %appdata%\PepperLib] + [Detailed view icon] + [Thumbnail view icon]
                    Bottom-right: Status bar */}
                <div className="px-2 py-1 text-xs flex items-center justify-between gap-2 rounded-b-xl border-t bg-[#F3F3F3] border-slate-300 text-slate-700">
                  {/* Bottom-left controls: [ⓘ Settings and cache...] + [Detailed view icon] + [Thumbnail view icon] */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setShowAppDataExplorerModal(true)}
                      title="Open %appdata%\PepperLib in File Explorer above PepperLib"
                      className="h-[26px] px-3.5 rounded-xs text-[11px] font-medium border cursor-pointer flex items-center transition-colors whitespace-nowrap bg-white hover:bg-slate-100 text-slate-800 border-slate-400"
                    >
                      ⓘ Settings and cache are saved in %appdata%\PepperLib
                    </button>

                    {/* Custom Detailed view icon button */}
                    <div className="relative group">
                      <button
                        onClick={() => {
                          setDetailsView(true);
                          setStatusBarText('Switched to detailed view.');
                        }}
                        aria-label="Detailed view"
                        className={`w-[30px] h-[26px] rounded-xs border cursor-pointer flex items-center justify-center transition-colors ${
                          detailsView
                            ? 'bg-sky-600 text-white border-sky-700'
                            : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-400'
                        }`}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <rect x="1" y="2" width="2.5" height="2.5" rx="0.5" fill={detailsView ? '#FFFFFF' : '#0EA5E9'} />
                          <rect x="5" y="2" width="10" height="2.5" rx="0.5" fill="currentColor" />
                          <rect x="1" y="6.75" width="2.5" height="2.5" rx="0.5" fill={detailsView ? '#FFFFFF' : '#0EA5E9'} />
                          <rect x="5" y="6.75" width="10" height="2.5" rx="0.5" fill="currentColor" />
                          <rect x="1" y="11.5" width="2.5" height="2.5" rx="0.5" fill={detailsView ? '#FFFFFF' : '#0EA5E9'} />
                          <rect x="5" y="11.5" width="10" height="2.5" rx="0.5" fill="currentColor" />
                        </svg>
                      </button>
                      <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute left-0 bottom-full mb-1.5 z-50 px-2 py-1 rounded-xs shadow-lg border text-[11px] whitespace-nowrap bg-[#252526] text-white border-[#454545]">
                        Detailed view
                      </div>
                    </div>

                    {/* Custom Thumbnail view icon button */}
                    <div className="relative group">
                      <button
                        onClick={() => {
                          setDetailsView(false);
                          setStatusBarText('Switched to thumbnail view (Ctrl+Scroll to resize).');
                        }}
                        aria-label="Thumbnail view"
                        className={`w-[30px] h-[26px] rounded-xs border cursor-pointer flex items-center justify-center transition-colors ${
                          !detailsView
                            ? 'bg-sky-600 text-white border-sky-700'
                            : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-400'
                        }`}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="0.75" stroke={!detailsView ? '#FFFFFF' : '#0EA5E9'} strokeWidth="1.3" fill="currentColor" fillOpacity="0.25" />
                          <rect x="9" y="1.5" width="5.5" height="5.5" rx="0.75" stroke={!detailsView ? '#FFFFFF' : '#0EA5E9'} strokeWidth="1.3" fill="currentColor" fillOpacity="0.25" />
                          <rect x="1.5" y="9" width="5.5" height="5.5" rx="0.75" stroke={!detailsView ? '#FFFFFF' : '#0EA5E9'} strokeWidth="1.3" fill="currentColor" fillOpacity="0.25" />
                          <rect x="9" y="9" width="5.5" height="5.5" rx="0.75" stroke={!detailsView ? '#FFFFFF' : '#0EA5E9'} strokeWidth="1.3" fill="currentColor" fillOpacity="0.25" />
                        </svg>
                      </button>
                      <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute left-0 bottom-full mb-1.5 z-50 px-2 py-1 rounded-xs shadow-lg border text-[11px] whitespace-nowrap bg-[#252526] text-white border-[#454545]">
                        Thumbnail view
                      </div>
                    </div>
                    {/* Green Loading Progress Bar in Bottom Bar */}
                    <div
                      title="Green loading bar: shows thumbnail loading, folder OCR, and PC filename indexing progress"
                      className="w-[175px] h-[22px] rounded-xs border border-emerald-700 bg-emerald-100 relative overflow-hidden flex items-center justify-center shrink-0"
                    >
                      <div
                        className={`absolute left-0 top-0 bottom-0 transition-all duration-200 ${
                          isPaused
                            ? 'bg-amber-400'
                            : isScanning
                            ? 'bg-emerald-500'
                            : 'bg-emerald-600'
                        }`}
                        style={{ width: `${greenProgressPct}%` }}
                      />
                      <span className="relative z-10 text-[10px] font-bold text-slate-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)] px-1 truncate">
                        {isPaused ? 'Paused' : greenProgressLabel}
                      </span>
                    </div>
                  </div>

                  {/* Bottom-right status bar */}
                  <div className="h-[26px] px-2.5 flex items-center font-mono text-[11px] truncate flex-1 min-w-[140px] border rounded-xs bg-white/80 border-slate-300 text-slate-700">
                    <span className="truncate">{statusBarText}</span>
                  </div>
                </div>
              </div>

              {/* Right Inspector: Live FTS5 Query, Multi-Select State & Cache Inspector */}
              <div className="lg:col-span-4 space-y-5">
                {/* Live FTS5 Query Inspector */}
                <div className="bg-[#1E293B]/60 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-white">
                      SQLite3 FTS5 + Scoped Folder / Home Query
                    </h3>
                    <span className="text-xs font-mono text-emerald-400">
                      {isDebouncing ? 'Waiting 280ms...' : 'Executed (0.11 ms)'}
                    </span>
                  </div>
                  <pre className="p-3 rounded-lg bg-[#0B1120] border border-slate-800 font-mono text-[11px] text-sky-300 overflow-x-auto leading-relaxed">
                    {fts5QueryString
                      ? `SELECT c.path, c.filename, c.parent_dir, c.file_size,\n  c.created_time, c.mtime,\n  snippet(image_fts, 2, '[', ']', '...', 14)\nFROM image_fts\nJOIN file_catalog c ON c.path = image_fts.path\nWHERE image_fts MATCH '${fts5QueryString}'${
                          selectedFolder.trim()
                            ? `\n  AND c.path LIKE '${selectedFolder.trim()}\\%'`
                            : ' /* Home: Global PC search */'
                        }\nORDER BY ${sortColumnId} ${sortAscending ? 'ASC' : 'DESC'} LIMIT 1200;`
                      : `SELECT c.path, c.filename, c.parent_dir, c.file_size,\n  c.created_time, c.mtime\nFROM file_catalog c${
                          selectedFolder.trim()
                            ? `\nWHERE c.path LIKE '${selectedFolder.trim()}\\%'`
                            : ' /* Home: Empty view */'
                        }\nORDER BY ${sortColumnId} ${sortAscending ? 'ASC' : 'DESC'} LIMIT 1200;`}
                  </pre>
                </div>

                {/* Multi-Select & Primary Item Inspector */}
                {primarySelectedIndex !== null && filteredResults[primarySelectedIndex] ? (
                  (() => {
                    const selectedItem = filteredResults[primarySelectedIndex];
                    const cached = sqliteMtimeCache[selectedItem.fullPath];
                    const isUpToDate =
                      cached && cached.mtimeTicks === selectedItem.lastWriteTimeTicks;

                    return (
                      <div className="bg-[#1E293B]/60 border border-slate-800 rounded-xl p-4 space-y-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs text-slate-400">
                              Selected ({selectedIndices.size} item{selectedIndices.size > 1 ? 's' : ''} — press Ctrl+A to select all)
                            </div>
                            <h3 className="text-sm font-semibold text-white break-all mt-0.5">
                              {selectedItem.fileName}
                            </h3>
                          </div>
                          <button
                            onClick={() => setOpenedPhotoModal(selectedItem)}
                            className="px-2.5 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 rounded-md text-xs font-medium flex items-center gap-1 shrink-0 whitespace-nowrap"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Open
                          </button>
                        </div>

                        <div className="space-y-1.5 text-xs border-t border-slate-800 pt-3">
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Location:</span>
                            <span className="font-mono text-slate-200 truncate max-w-[200px]">
                              {selectedItem.folder}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Size / created:</span>
                            <span className="font-mono text-slate-200">
                              {selectedItem.fileSizeKb} KB · {selectedItem.dateCreatedHuman}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Index status:</span>
                            <span
                              className={`font-mono font-semibold ${
                                selectedItem.isPcCatalogOnly
                                  ? 'text-sky-400'
                                  : isUpToDate
                                  ? 'text-emerald-400'
                                  : 'text-amber-400'
                              }`}
                            >
                              {selectedItem.isPcCatalogOnly
                                ? 'PC filename catalog (no OCR)'
                                : isUpToDate
                                ? 'OCR cached (%APPDATA%)'
                                : 'Needs OCR scan'}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1.5 border-t border-slate-800 pt-3">
                          <div className="text-xs font-medium text-slate-300">
                            Extracted OCR / document content:
                          </div>
                          <div className="p-3 rounded-lg bg-[#0B1120] border border-slate-800 text-xs font-mono text-slate-200 leading-relaxed">
                            {selectedItem.isPcCatalogOnly
                              ? 'Indexed by PC-wide filename scanner. Select this folder with Browse folder or run OCR all indexed files in Option.'
                              : highlightSearchTokens(selectedItem.ocrText, debouncedQuery)}
                          </div>
                        </div>

                        {!selectedItem.isPcCatalogOnly && (
                          <button
                            onClick={() => simulateModifyFileTimestamp(selectedItem.id)}
                            className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                          >
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            Modify file timestamp and trigger re-index
                          </button>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div className="bg-[#1E293B]/60 border border-slate-800 rounded-xl p-4 text-xs text-slate-400">
                    Click or right-click any item in the ListView (or press Ctrl+A to select all) to inspect or run shell operations.
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* SECTION 3: FEATURE IMPLEMENTATION MATRIX */}
        {activeSection === 'architecture' && (
          <section className="space-y-6">
            <div className="bg-[#1E293B]/60 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800">
                <h3 className="text-sm font-semibold text-white">
                  PepperLib complete feature matrix (C++20 Win32 implementations)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/50">
                      <th className="py-3 px-4 font-medium">Requested feature</th>
                      <th className="py-3 px-4 font-medium">Native C++20 / Win32 / WinRT implementation</th>
                      <th className="py-3 px-4 font-medium">Function / control in main.cpp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    <tr>
                      <td className="py-3 px-4 font-medium text-white">1. Ctrl + A to select all</td>
                      <td className="py-3 px-4 font-mono text-sky-300">
                        Pressing Ctrl + A selects all items in the results ListView via ListView_SetItemState(..., -1, LVIS_SELECTED, LVIS_SELECTED)
                      </td>
                      <td className="py-3 px-4 font-mono">ListViewSubclassProc() / wWinMain()</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-medium text-white">2 &amp; 4. Default options (&apos;Exclude sub-folder&apos; ON, &apos;Start on previously opened path&apos; OFF)</td>
                      <td className="py-3 px-4 font-mono text-sky-300">
                        excludeSubfolders defaults to true; startOnPrevPath defaults to false (starts on empty Home view)
                      </td>
                      <td className="py-3 px-4 font-mono">AppState / LoadSettings()</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-medium text-white">3 &amp; 5. Dark mode removed + widened bottom-left AppData button</td>
                      <td className="py-3 px-4 font-mono text-emerald-300">
                        Clean standard Windows light mode throughout; dynamically measures and widens &quot;ⓘ - Settings and cache are saved in %appdata%\pepperlib&quot; so it is never cropped
                      </td>
                      <td className="py-3 px-4 font-mono">LayoutControls() / GetTextExtentPoint32W()</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-medium text-white">6 &amp; 7. Full Desktop indexing (including OneDrive Desktop) + zero lag on Browse folder</td>
                      <td className="py-3 px-4 font-mono text-sky-300">
                        Resolves FOLDERID_Desktop, %USERPROFILE%\Desktop, and OneDrive Desktop; uses fast Win32 FindFirstFileExW + off-UI-thread ThumbnailDecodeWorker so selecting a folder never lags
                      </td>
                      <td className="py-3 px-4 font-mono">GetTargetFoldersForPath() / ThumbnailDecodeWorker()</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-medium text-white">8 &amp; 9. &apos;Exclude windows important file&apos; option + &apos;Move to recycle bin&apos; context menu</td>
                      <td className="py-3 px-4 font-mono text-emerald-300">
                        Option checkbox filters Windows system directories and OS metadata files (desktop.ini, thumbs.db, C:\Windows\, $Recycle.Bin, etc.); right-click menu replaces Delete with &quot;Move to recycle bin&quot;
                      </td>
                      <td className="py-3 px-4 font-mono">IsWindowsImportantFileOrPath() / ShowItemRightClickMenu()</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Floating Right-Click Item Context Menu (Closes immediately before opening Properties) */}
      {itemContextMenu && (
        <div
          style={{ top: itemContextMenu.y, left: itemContextMenu.x }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 w-64 rounded-md shadow-2xl border border-[#454545] bg-[#252526] text-slate-100 py-1 text-xs"
        >
          <button
            onClick={handleCtxOpen}
            className="w-full text-left px-3 py-1.5 hover:bg-[#094771] font-semibold flex items-center justify-between"
          >
            <span>Open</span>
            <span className="text-[10px] text-slate-400 font-mono">Enter</span>
          </button>
          <button
            onClick={() => {
              const items = getSelectedItems();
              setItemContextMenu(null);
              if (items.length > 0 && items[0].extension !== '<DIR>') {
                setNotepadModalItem(items[0]);
                setStatusBarText(
                  `Opened OCR / content in Notepad (default .txt editor): ${items[0].fileName}_ocr.txt`
                );
              }
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#094771] flex items-center justify-between"
          >
            <span>Open OCR / content in text editor</span>
            <span className="text-[10px] text-sky-400 font-mono">.txt</span>
          </button>
          <button
            onClick={handleCtxOpenLocation}
            className="w-full text-left px-3 py-1.5 hover:bg-[#094771] flex items-center justify-between"
          >
            <span>Open file location</span>
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
          </button>
          <div className="my-1 border-t border-[#3F3F3F]" />
          <button
            onClick={handleCtxRename}
            className="w-full text-left px-3 py-1.5 hover:bg-[#094771] flex items-center justify-between gap-4"
          >
            <span>Rename</span>
            <span className="text-[10px] text-slate-400 font-mono">F2</span>
          </button>
          <button
            onClick={handleCtxCutFiles}
            className="w-full text-left px-3 py-1.5 hover:bg-[#094771] flex items-center justify-between gap-4"
          >
            <span>Cut</span>
            <span className="text-[10px] text-slate-400 font-mono">Ctrl + X</span>
          </button>
          <button
            onClick={handleCtxCopyFiles}
            className="w-full text-left px-3 py-1.5 hover:bg-[#094771] flex items-center justify-between gap-4"
          >
            <span>Copy</span>
            <span className="text-[10px] text-slate-400 font-mono">Ctrl + C</span>
          </button>
          <button
            onClick={handleCtxCopyPaths}
            className="w-full text-left px-3 py-1.5 hover:bg-[#094771] flex items-center justify-between gap-4"
          >
            <span>Copy file path</span>
            <span className="text-[10px] text-slate-400 font-mono">Ctrl + Shift + C</span>
          </button>
          <div className="my-1 border-t border-[#3F3F3F]" />
          <button
            onClick={handleCtxDelete}
            className="w-full text-left px-3 py-1.5 hover:bg-red-600/30 text-red-300 flex items-center justify-between gap-4"
          >
            <span>Move to recycle bin</span>
            <span className="text-[10px] text-red-300/80 font-mono">Ctrl + D, Delete</span>
          </button>
          <div className="my-1 border-t border-[#3F3F3F]" />
          <button
            onClick={() => {
              const items = getSelectedItems();
              setItemContextMenu(null);
              if (items.length > 0) {
                setPropertiesModalItem(items[0]);
              }
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#094771] flex items-center justify-between"
          >
            <span>Properties</span>
            <Info className="w-3.5 h-3.5 text-sky-400" />
          </button>
        </div>
      )}

      {/* Floating Right-Click Column Header Context Menu (Show/hide columns in detailed view) */}
      {headerContextMenu && (
        <div
          style={{ top: headerContextMenu.y, left: headerContextMenu.x }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 w-56 rounded-md shadow-2xl border border-[#454545] bg-[#252526] text-slate-100 py-1.5 text-xs"
        >
          <div className="px-3 py-1 text-[10px] font-mono text-slate-400 border-b border-[#3F3F3F] mb-1">
            Toggle detailed view columns
          </div>
          {columns.map((col) => (
            <button
              key={col.id}
              onClick={() => toggleColumnVisibility(col.id)}
              disabled={col.id === 'name'}
              className="w-full text-left px-3 py-1.5 hover:bg-[#094771] disabled:opacity-50 flex items-center justify-between"
            >
              <span>{col.label}</span>
              {col.visible && <Check className="w-3.5 h-3.5 text-red-500" />}
            </button>
          ))}
        </div>
      )}

      {/* Modal: Rename Item (Right-Click -> Rename or F2 Shortcut) */}
      {renameModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="rounded-lg border shadow-2xl max-w-sm w-full overflow-hidden bg-white text-slate-900 border-slate-400">
            <div className="px-4 py-2.5 border-b flex items-center justify-between bg-slate-100 border-slate-300">
              <div className="flex items-center gap-2">
                <PepperLibIcon size={16} />
                <span className="text-xs font-semibold">Rename (F2)</span>
              </div>
              <button
                onClick={() => setRenameModalItem(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <label className="block font-medium text-slate-700">
                {renameModalItem.extension === '<DIR>'
                  ? 'Enter a new folder name:'
                  : 'Enter a new file name:'}
              </label>
              <input
                type="text"
                autoFocus
                value={renameInputValue}
                onChange={(e) => setRenameInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirmRename();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setRenameModalItem(null);
                  }
                }}
                className="w-full px-2.5 py-1.5 border border-slate-400 rounded-xs text-xs font-mono text-slate-900 focus:outline-none focus:border-sky-600"
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={handleConfirmRename}
                  className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xs font-semibold cursor-pointer"
                >
                  Rename
                </button>
                <button
                  onClick={() => setRenameModalItem(null)}
                  className="px-4 py-1.5 border rounded-xs font-semibold cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: OCR all indexed files warning dialog ("Your PC probably will lag so much" + "Run anyway" / "Cancel") */}
      {showOcrAllWarningModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="rounded-lg border shadow-2xl max-w-md w-full overflow-hidden bg-white text-slate-900 border-slate-400">
            <div className="px-4 py-2.5 border-b flex items-center justify-between bg-slate-100 border-slate-300">
              <div className="flex items-center gap-2">
                <PepperLibIcon size={16} />
                <span className="text-xs font-semibold">OCR all indexed files</span>
              </div>
              <button
                onClick={() => setShowOcrAllWarningModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="font-semibold text-sm text-amber-600">
                Your PC probably will lag so much
              </div>
              <p className="text-slate-600 leading-relaxed">
                This will scan and extract text from all indexed images and documents across your PC in the background. Safety throttling is enabled so PepperLib and Windows will not freeze or crash, and you can pause it anytime.
              </p>
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  onClick={handleRunOcrAllIndexedFiles}
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-xs font-semibold cursor-pointer"
                >
                  Run anyway
                </button>
                <button
                  onClick={() => setShowOcrAllWarningModal(false)}
                  className="px-4 py-1.5 border rounded-xs font-semibold cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 1: Simulated Format filter popup window (Sentence case + horizontal line separator between image and document formats) */}
      {showFormatFilterModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="rounded-lg border shadow-2xl max-w-sm w-full overflow-hidden bg-white text-slate-900 border-slate-400">
            <div className="px-4 py-2.5 border-b flex items-center justify-between bg-slate-100 border-slate-300">
              <div className="flex items-center gap-2">
                <PepperLibIcon size={16} />
                <span className="text-xs font-semibold">
                  Format filter
                </span>
              </div>
              <button
                onClick={() => setShowFormatFilterModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-2.5 text-xs">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabledFormats['<DIR>'] !== false}
                  onChange={(e) =>
                    setEnabledFormats((prev) => ({ ...prev, '<DIR>': e.target.checked }))
                  }
                  className="accent-red-600"
                />
                <span>Folders</span>
              </label>

              {/* Line separator between folder and image formats */}
              <div className="my-2.5 border-t border-slate-300" />

              {[
                { ext: '.png', label: 'PNG images', isImage: true },
                { ext: '.jpg', label: 'JPEG images', isImage: true },
                { ext: '.webp', label: 'WebP images', isImage: true },
                { ext: '.bmp', label: 'Bitmap images', isImage: true },
              ].map((item) => (
                <label key={item.ext} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabledFormats[item.ext] !== false}
                    onChange={(e) =>
                      setEnabledFormats((prev) => ({ ...prev, [item.ext]: e.target.checked }))
                    }
                    className="accent-red-600"
                  />
                  <span>{item.label}</span>
                </label>
              ))}

              {/* Line separator between image formats and document formats */}
              <div className="my-2.5 border-t border-slate-300" />

              {[
                { ext: '.pdf', label: 'PDF documents', isImage: false },
                { ext: '.txt', label: 'Plain text', isImage: false },
                { ext: '.md', label: 'Markdown', isImage: false },
                { ext: '.csv', label: 'CSV / TSV spreadsheets', isImage: false },
                { ext: '.json', label: 'JSON / XML / config', isImage: false },
              ].map((item) => (
                <label key={item.ext} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabledFormats[item.ext] !== false}
                    onChange={(e) =>
                      setEnabledFormats((prev) => ({ ...prev, [item.ext]: e.target.checked }))
                    }
                    className="accent-red-600"
                  />
                  <span>{item.label}</span>
                </label>
              ))}

              <div className="pt-3 border-t flex items-center justify-between gap-2 border-slate-200">
                <button
                  onClick={() => setEnabledFormats(DEFAULT_ENABLED_FORMATS)}
                  className="px-2.5 py-1.5 border rounded-xs font-medium cursor-pointer bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-900"
                >
                  All on
                </button>
                <button
                  onClick={() =>
                    setEnabledFormats({
                      '<DIR>': false,
                      '.png': true,
                      '.jpg': true,
                      '.webp': true,
                      '.bmp': true,
                      '.pdf': false,
                      '.txt': false,
                      '.md': false,
                      '.csv': false,
                      '.json': false,
                    })
                  }
                  className="px-2.5 py-1.5 border rounded-xs font-medium cursor-pointer bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-900"
                >
                  Images only
                </button>
                <button
                  onClick={() =>
                    setEnabledFormats({
                      '<DIR>': false,
                      '.png': false,
                      '.jpg': false,
                      '.webp': false,
                      '.bmp': false,
                      '.pdf': true,
                      '.txt': true,
                      '.md': true,
                      '.csv': true,
                      '.json': true,
                    })
                  }
                  className="px-2.5 py-1.5 border rounded-xs font-medium cursor-pointer bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-900"
                >
                  Docs only
                </button>
                <button
                  onClick={() => {
                    setShowFormatFilterModal(false);
                    triggerBackgroundScan(
                      selectedFolder,
                      foldersData,
                      sqliteMtimeCache,
                      excludeSubfolder,
                      enabledFormats,
                      excludeWinImportantFiles
                    );
                  }}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-xs font-semibold cursor-pointer"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Simulated IFileOpenDialog (Browse folder... with FOS_ALLOWMULTISELECT) */}
      {showFolderPickerModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="px-4 py-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <FolderOpen className="w-4 h-4 text-amber-400" />
                Select folder(s) to index and OCR (multi-select supported)
              </div>
              <button
                onClick={() => setShowFolderPickerModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-300">
                Uses <code className="font-mono text-sky-300">FOS_PICKFOLDERS | FOS_ALLOWMULTISELECT</code> so you can select one or multiple folders at once. Thumbnails load first before OCR runs only on new/modified files:
              </p>
              <div className="space-y-2">
                {folderKeys.map((folderKey) => {
                  const isChecked = multiPickerSelection.has(folderKey);
                  return (
                    <div
                      key={folderKey}
                      onClick={() => {
                        setMultiPickerSelection((prev) => {
                          const next = new Set(prev);
                          if (next.has(folderKey)) next.delete(folderKey);
                          else next.add(folderKey);
                          return next;
                        });
                      }}
                      className={`w-full text-left p-3 rounded-lg border transition-colors flex items-center justify-between cursor-pointer ${
                        isChecked
                          ? 'bg-sky-500/15 border-sky-500/50 text-white'
                          : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate pr-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="accent-sky-500 cursor-pointer"
                        />
                        <div className="truncate">
                          <div className="text-xs font-mono font-semibold truncate">{folderKey}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {foldersData[folderKey].length} files (Images, PDFs, TXT, MD, CSV)
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          applyFolderSelection(folderKey, true);
                          setShowFolderPickerModal(false);
                        }}
                        className="px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 rounded-md shrink-0 cursor-pointer"
                      >
                        Open single
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-800">
                <span className="text-xs text-slate-400">
                  {multiPickerSelection.size} folder(s) selected
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowFolderPickerModal(false)}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={multiPickerSelection.size === 0}
                    onClick={() => {
                      const joined = Array.from(multiPickerSelection).join('; ');
                      applyFolderSelection(joined, true);
                      setShowFolderPickerModal(false);
                    }}
                    className="px-3.5 py-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 rounded-md cursor-pointer"
                  >
                    Select {multiPickerSelection.size > 1 ? `${multiPickerSelection.size} folders` : 'folder'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Simulated File Explorer opened above PepperLib for %appdata%\PepperLib */}
      {showAppDataExplorerModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-lg border-2 border-sky-500 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-300 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <FolderOpen className="w-4 h-4 text-amber-500" />
                <span>File Explorer — C:\Users\Engineer\AppData\Roaming\PepperLib (z-order: above PepperLib)</span>
              </div>
              <button
                onClick={() => setShowAppDataExplorerModal(false)}
                className="text-slate-500 hover:text-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-md text-sky-900 font-mono text-[11px]">
                %appdata%\PepperLib (all filename lists, thumbnail cache, OCR text &amp; settings saved here)
              </div>
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
                <div className="p-3 flex items-center justify-between">
                  <div>
                    <div className="font-mono font-semibold text-slate-900">pepperlib_cache.db</div>
                    <div className="text-slate-500">
                      SQLite3: file_catalog (PC filename list) + thumb_cache (240px BGRA thumbnails) + image_fts (OCR cache) + app_kv
                    </div>
                  </div>
                  <span className="font-mono text-slate-600 shrink-0 ml-2">2,840 KB</span>
                </div>
                <div className="p-3 flex items-center justify-between">
                  <div>
                    <div className="font-mono font-semibold text-slate-900">settings.ini</div>
                    <div className="text-slate-500">
                      Persists LastFolder, Bookmarks, ExcludeSubfolders, ExcludeWinImportantFiles, DetailsView, Sort &amp; Formats
                    </div>
                  </div>
                  <span className="font-mono text-slate-600 shrink-0 ml-2">4 KB</span>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => setShowAppDataExplorerModal(false)}
                  className="px-4 py-1.5 bg-slate-900 text-white rounded-md font-medium"
                >
                  Close Explorer window
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3B: Simulated Right-Click "Open File Location" Explorer Window (Opened Above PepperLib) */}
      {fileLocationExplorerItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-lg border-2 border-amber-500 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-300 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <FolderOpen className="w-4 h-4 text-amber-500" />
                <span>File Explorer — {fileLocationExplorerItem.folder} (Z-Order: Above PepperLib)</span>
              </div>
              <button
                onClick={() => setFileLocationExplorerItem(null)}
                className="text-slate-500 hover:text-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-md text-amber-900 font-mono text-[11px]">
                SHOpenFolderAndSelectItems + AllowSetForegroundWindow + PromoteWindowAbovePepperLibAsync()
              </div>
              <div className="p-3 bg-sky-50 border border-sky-300 rounded-md flex items-center justify-between">
                <div>
                  <div className="font-mono font-semibold text-slate-900">{fileLocationExplorerItem.fileName}</div>
                  <div className="text-slate-500 font-mono text-[11px]">{fileLocationExplorerItem.fullPath}</div>
                </div>
                <span className="px-2 py-0.5 bg-sky-600 text-white rounded-xs font-semibold text-[10px]">
                  Selected
                </span>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => setFileLocationExplorerItem(null)}
                  className="px-4 py-1.5 bg-slate-900 text-white rounded-md font-medium"
                >
                  Close Explorer Window
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Simulated Right-Click Properties Dialog (Opened Above PepperLib) */}
      {propertiesModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-sky-500 rounded-xl max-w-md w-full overflow-hidden shadow-2xl">
            <div className="px-4 py-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Info className="w-4 h-4 text-sky-400" />
                {propertiesModalItem.fileName} Properties (Z-Order: Above PepperLib)
              </div>
              <button
                onClick={() => setPropertiesModalItem(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">File Name:</span>
                <span className="font-mono text-white">{propertiesModalItem.fileName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Type:</span>
                <span className="font-mono text-slate-200">{propertiesModalItem.category}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Location:</span>
                <span className="font-mono text-slate-200 truncate max-w-[230px]">{propertiesModalItem.folder}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Size:</span>
                <span className="font-mono text-slate-200">{propertiesModalItem.fileSizeKb} KB</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Created:</span>
                <span className="font-mono text-slate-200">{propertiesModalItem.dateCreatedHuman}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Modified:</span>
                <span className="font-mono text-slate-200">{propertiesModalItem.lastModifiedHuman}</span>
              </div>
              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setPropertiesModalItem(null)}
                  className="px-4 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded-md"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 5: Simulated ShellExecuteExW(L"open", path) Viewer (Opened Above PepperLib) */}
      {openedPhotoModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-sky-500 rounded-xl max-w-xl w-full overflow-hidden shadow-2xl">
            <div className="px-4 py-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-white truncate">
                <ExternalLink className="w-4 h-4 text-sky-400 shrink-0" />
                <span className="truncate">
                  ShellExecuteExW(L&quot;open&quot;) — {openedPhotoModal.fileName} (Z-Order: Above PepperLib)
                </span>
              </div>
              <button
                onClick={() => setOpenedPhotoModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="text-xs font-mono text-slate-400 break-all">
                Full Path: <span className="text-slate-200">{openedPhotoModal.fullPath}</span>
              </div>
              <div className="p-5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-sky-400 uppercase tracking-wider">
                  Extracted OCR / Document Text
                </div>
                <p className="text-sm font-mono text-slate-100 leading-relaxed">
                  {openedPhotoModal.isPcCatalogOnly
                    ? 'This file was found via the PC-Wide Filename Indexer. Select its parent folder via Browse folder... to run Windows.Media.Ocr on it.'
                    : openedPhotoModal.ocrText}
                </p>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => setOpenedPhotoModal(null)}
                  className="px-4 py-2 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg"
                >
                  Close Viewer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 6: Simulated Notepad / Default .txt Text Editor when clicking "OCR / content" */}
      {notepadModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 border-2 border-slate-400 rounded-lg max-w-xl w-full overflow-hidden shadow-2xl">
            <div className="px-3.5 py-2 bg-[#F1F5F9] border-b border-slate-300 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 truncate">
                <FileCode className="w-4 h-4 text-sky-600 shrink-0" />
                <span className="truncate">
                  {notepadModalItem.extension.toLowerCase() === '.txt'
                    ? `${notepadModalItem.fileName} — Notepad`
                    : `${notepadModalItem.fileName}_ocr.txt — Notepad (Default .txt Editor)`}
                </span>
              </div>
              <button
                onClick={() => setNotepadModalItem(null)}
                className="text-slate-500 hover:text-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-3 py-1 bg-slate-50 border-b border-slate-200 flex items-center gap-4 text-[11px] text-slate-600">
              <span>File</span>
              <span>Edit</span>
              <span>Format</span>
              <span>View</span>
              <span>Help</span>
            </div>
            <div className="p-4 bg-white">
              <textarea
                readOnly
                value={
                  notepadModalItem.ocrText ||
                  `Extracted OCR / text content for ${notepadModalItem.fileName} (${notepadModalItem.fullPath})`
                }
                className="w-full h-56 font-mono text-xs text-slate-900 bg-white focus:outline-none resize-none leading-relaxed"
              />
            </div>
            <div className="px-3.5 py-2 bg-[#F8FAFC] border-t border-slate-200 flex items-center justify-between text-[11px] font-mono text-slate-500">
              <span>UTF-8 with BOM · Windows (CRLF) · %appdata%\PepperLib\ocr_text</span>
              <button
                onClick={() => setNotepadModalItem(null)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-xs font-sans font-medium cursor-pointer"
              >
                Close Notepad
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
