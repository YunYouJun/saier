import type { BlendMode, BuiltinBrushPresetId, MemoryRiskLevel } from '@saier/core'
import type { SitePainterCommand, SitePainterCommandCategory } from '~/types/painter-app'
import { computed, shallowRef } from 'vue'

export const SITE_LOCALE_OPTIONS = [
  {
    code: 'en',
    label: 'English',
    shortLabel: 'EN',
    htmlLang: 'en',
  },
  {
    code: 'zh',
    label: '中文',
    shortLabel: '中',
    htmlLang: 'zh-CN',
  },
] as const

export type SiteLocale = typeof SITE_LOCALE_OPTIONS[number]['code']
export type SiteLocaleOption = typeof SITE_LOCALE_OPTIONS[number]

interface SiteMessages {
  appName: string
  tagline: string
  language: string
  exportPreview: string
  closePreview: string
  loading: string
  notices: {
    close: string
    projectDraftClearFailed: string
    projectDraftReadFailed: string
    projectDraftRestoreFailed: string
    projectDraftSaveFailed: string
    brushPresetMissingEngine: string
    brushPresetRequiresSampler: string
    brushPresetUnavailable: string
    brushImportFailed: string
    brushImportInvalidMyPaint: string
    brushImportSavedLocally: string
    brushImportSucceeded: string
    brushImportUnsupported: string
    brushImportUnsupportedSai: string
    projectImportFailed: string
    projectImportInvalidJson: string
    projectImportInvalidProject: string
    projectImportReadFailed: string
  }
  account: {
    checking: string
    error: string
    nativeApp: string
    openSettings: string
    signIn: string
    signedIn: string
    signingIn: string
  }
  activities: {
    close: string
    loadFailed: string
    loading: string
    unavailable: string
  }
  cloudFiles: {
    brushLibrary: string
    brushLibraryCount: string
    brushLibraryEmpty: string
    brushLibrarySync: string
    brushLibrarySynced: string
    brushLibrarySyncing: string
    checkingQuota: string
    close: string
    confirmRemove: string
    deleting: string
    downloadFailed: string
    downloading: string
    empty: string
    finalizing: string
    invalidLibrary: string
    invalidProject: string
    load: string
    loading: string
    maxFileSize: string
    memberPlan: string
    name: string
    missingDatabase: string
    missingStorage: string
    normalPlan: string
    notAuthenticated: string
    quotaAvailable: string
    quotaExceeded: string
    quotaUsed: string
    recentFiles: string
    refresh: string
    renaming: string
    rename: string
    renameFailed: string
    remove: string
    reservationExpired: string
    saveRename: string
    signIn: string
    signInRequired: string
    size: string
    title: string
    tooLarge: string
    updated: string
    uploadCurrent: string
    uploading: string
  }
  cloudRooms: {
    backendGated: string
    backendUnavailable: string
    close: string
    copyFailed: string
    copyLink: string
    copySucceeded: string
    create: string
    createTitle: string
    creating: string
    driverEditor: string
    errorTitle: string
    forbidden: string
    invalidSnapshot: string
    join: string
    joinInput: string
    joinTitle: string
    joining: string
    leave: string
    members: string
    modeDriver: string
    modeMultiEditor: string
    modeViewer: string
    noEditorAvailable: string
    notAuthenticated: string
    owner: string
    ownerTools: string
    readOnly: string
    readOnlyBlocked: string
    readOnlyTitle: string
    revisionConflict: string
    roleEditor: string
    roleOwner: string
    roleViewer: string
    roomNotFound: string
    roomMode: string
    saveRoomMode: string
    setRoleEditor: string
    setRoleViewer: string
    share: string
    shareFailed: string
    shareLink: string
    shareTitle: string
    signIn: string
    status: string
    title: string
    tooLarge: string
  }
  menu: {
    file: string
    activities: string
    newCanvas: string
    openProject: string
    saveProject: string
    cloudSync: string
    cloudRoom: string
    importBrush: string
    importImage: string
    exportPreview: string
    download: string
    edit: string
    undo: string
    redo: string
    view: string
    zoomIn: string
    zoomOut: string
    language: string
    appearance: string
    themeSystem: string
    themeLight: string
    themeDark: string
    others: string
    keyboardShortcuts: string
    filter: string
    repeatFilter: string
    adjustments: string
    invert: string
    grayscale: string
    blur: string
    gaussianBlur: string
    pixelate: string
    window: string
    showPanels: string
    showColorPanels: string
    collapsePanel: string
    detachPanel: string
    expandPanel: string
    hidePanel: string
    brushOptionsPanel: string
    operationPanel: string
    layerPanel: string
    navigatorPanel: string
    diagnosticsPanel: string
    colorWheelPanel: string
    colorPalettePanel: string
    rgbSlidersPanel: string
    tools: string
    brush: string
    eraser: string
    pan: string
    image: string
    selection: string
    recordingStart: string
    recordingStop: string
    recordingReplay: string
    recordingClear: string
    layers: string
    addLayer: string
    addGroup: string
    showActiveLayer: string
    moveActiveLayerUp: string
    moveActiveLayerDown: string
    removeActiveLayer: string
  }
  navigator: {
    empty: string
    panCanvas: string
    refresh: string
    resetView: string
    title: string
  }
  recording: {
    closePreview: string
    emptyHint: string
    exportFailed: string
    exportLog: string
    importFailed: string
    importLog: string
    imported: string
    invalidLog: string
    pause: string
    play: string
    position: string
    previewActive: string
    reset: string
    speed: string
    step: string
  }
  shortcuts: {
    title: string
    search: string
    searchPlaceholder: string
    resetDefaults: string
    close: string
    category: string
    command: string
    shortcut: string
    noResults: string
    unassigned: string
    categories: Record<SitePainterCommandCategory, string>
    commands: Record<SitePainterCommand, string>
  }
  status: {
    ready: string
    tool: string
    layer: string
    noLayer: string
  }
  controls: {
    backgroundColor: string
    blue: string
    brush: string
    colorPicker: string
    eraser: string
    foregroundColor: string
    green: string
    hex: string
    hue: string
    image: string
    palette: string
    red: string
    selection: string
    saturation: string
    value: string
    clear: string
    zoomIn: string
    zoomOut: string
    extract: string
    download: string
    undo: string
    redo: string
  }
  brushOptions: {
    pressure: string
    stabilizer: string
    size: string
    opacity: string
    spacing: string
    hardness: string
    flow: string
    smudge: string
    colorAmount: string
    dilution: string
    persistence: string
    wetEdge: string
    density: string
    paperTexture: string
    paperTextureStrength: string
    missingEngine: string
    requiresTileBackend: string
    unavailablePreset: string
    addBrush: string
    addGroup: string
    brushGroups: string
    brushPresets: string
    customBrush: string
    customGroupName: string
    groupLabels: Record<string, string>
    removeBrush: string
    removeGroup: string
    presetLabels: Record<BuiltinBrushPresetId, string>
  }
  memory: {
    browser: string
    diagnostics: string
    estimated: string
    event: string
    input: string
    inputDevice: string
    inputDrawing: string
    inputNo: string
    inputPressure: string
    inputSamples: string
    inputTilt: string
    inputYes: string
    status: string
    surface: string
    total: string
    undo: string
    unavailable: string
    risk: Record<MemoryRiskLevel, string>
  }
  documents: {
    tabs: string
    newCanvas: string
    closeDocument: string
    title: string
    name: string
    width: string
    height: string
    preset: string
    custom: string
    preview: string
    aspectRatio: string
    create: string
    cancel: string
    size: string
    invalidSize: string
    unsavedChangesTitle: string
    unsavedChangesConfirm: string
    discardChanges: string
    defaultName: string
    draftRecovery: {
      close: string
      discard: string
      file: string
      message: string
      restore: string
      size: string
      title: string
      updatedAt: string
      unknownName: string
    }
    presets: {
      square512: string
      square1024: string
      hd: string
      portrait: string
      a4: string
      large4096: string
    }
  }
  layers: {
    title: string
    addLayer: string
    addGroup: string
    hideLayer: string
    showLayer: string
    moveUp: string
    moveDown: string
    moveIn: string
    moveOut: string
    removeLayer: string
    ungroup: string
    collapseGroup: string
    expandGroup: string
    addMask: string
    removeMask: string
    enableMask: string
    disableMask: string
    paintContent: string
    paintMask: string
    defaultLayerName: string
    defaultGroupName: string
    blendModes: Record<BlendMode, string>
  }
}

const STORAGE_KEY = 'saier:locale'

const messages: Record<SiteLocale, SiteMessages> = {
  en: {
    appName: 'Saier',
    tagline: 'Online painting workspace',
    language: 'Language',
    exportPreview: 'Export preview',
    closePreview: 'Close preview',
    loading: 'Loading painter...',
    notices: {
      close: 'Dismiss',
      projectDraftClearFailed: 'Could not discard the local draft.',
      projectDraftReadFailed: 'Could not read the local draft.',
      projectDraftRestoreFailed: 'Could not restore the local draft.',
      projectDraftSaveFailed: 'Could not save the local draft.',
      brushPresetMissingEngine: 'The external brush engine for this preset is not loaded.',
      brushPresetRequiresSampler: 'This brush needs surface sampling. Switch to the tiled backend to use smudge and watercolor presets.',
      brushPresetUnavailable: 'Brush unavailable',
      brushImportFailed: 'Could not import this brush.',
      brushImportInvalidMyPaint: 'This .myb file does not look like a MyPaint brush preset.',
      brushImportSavedLocally: 'Brush imported locally. Cloud sync failed.',
      brushImportSucceeded: 'Brush imported',
      brushImportUnsupported: 'Import a MyPaint .myb brush file.',
      brushImportUnsupportedSai: 'SAI brush presets are not an open import format yet. Import MyPaint .myb for now.',
      projectImportFailed: 'Could not open this project.',
      projectImportInvalidJson: 'The selected file is not valid JSON.',
      projectImportInvalidProject: 'The JSON file is not a valid Saier project.',
      projectImportReadFailed: 'Could not read the selected file.',
    },
    account: {
      checking: 'Syncing',
      error: 'Account error',
      nativeApp: 'YunLeFun app',
      openSettings: 'Open YunLeFun account settings',
      signIn: 'Sign in',
      signedIn: 'Signed in',
      signingIn: 'Signing in',
    },
    activities: {
      close: 'Close activity',
      loadFailed: 'Could not load this Activity. Try again later.',
      loading: 'Loading Activity...',
      unavailable: 'This Activity plugin is unavailable.',
    },
    cloudFiles: {
      brushLibrary: 'Brush library',
      brushLibraryCount: 'Brushes',
      brushLibraryEmpty: 'No synced custom brushes',
      brushLibrarySync: 'Sync brushes',
      brushLibrarySynced: 'Last synced',
      brushLibrarySyncing: 'Syncing brushes...',
      checkingQuota: 'Checking storage...',
      close: 'Close',
      confirmRemove: 'Delete this cloud file?',
      deleting: 'Deleting...',
      downloadFailed: 'Failed to download cloud file.',
      downloading: 'Loading...',
      empty: 'No cloud files yet',
      finalizing: 'Finalizing...',
      invalidLibrary: 'This cloud file is not a valid Saier brush library.',
      invalidProject: 'This cloud file is not a valid Saier project.',
      load: 'Load',
      loading: 'Loading files...',
      maxFileSize: 'File limit',
      memberPlan: 'Member storage',
      name: 'Name',
      missingDatabase: 'Cloud file index is not available. Check the CloudBase collection and permissions.',
      missingStorage: 'Cloud storage is not available. Check the CloudBase storage security domain.',
      normalPlan: 'Free storage',
      notAuthenticated: 'Sign in with YunLeFun to sync files.',
      quotaAvailable: 'Available',
      quotaExceeded: 'Not enough YunLeFun cloud storage for this upload.',
      quotaUsed: 'Used',
      recentFiles: 'Recent files',
      refresh: 'Refresh',
      renaming: 'Renaming...',
      rename: 'Rename',
      renameFailed: 'Failed to rename cloud file.',
      remove: 'Delete',
      reservationExpired: 'The upload reservation expired. Please try again.',
      saveRename: 'Save name',
      signIn: 'Sign in',
      signInRequired: 'Sign in with YunLeFun to use shared cloud storage.',
      size: 'Size',
      title: 'Cloud sync',
      tooLarge: 'The project is larger than 200 MB.',
      updated: 'Updated',
      uploadCurrent: 'Upload current',
      uploading: 'Uploading...',
    },
    cloudRooms: {
      backendGated: 'Requires the saier-room-api backend. The UI is wired, but real sharing depends on deployment.',
      backendUnavailable: 'Cloud room backend is not available yet. Deploy saier-room-api before real sharing.',
      close: 'Close',
      copyFailed: 'Could not copy the room link.',
      copyLink: 'Copy link',
      copySucceeded: 'Room link copied',
      create: 'Create room',
      createTitle: 'Create from current canvas',
      creating: 'Creating room...',
      driverEditor: 'Driver editor',
      errorTitle: 'Cloud room error',
      forbidden: 'You do not have access to this room.',
      invalidSnapshot: 'The room snapshot is not a valid Saier project.',
      join: 'Join room',
      joinInput: 'Room link or ID',
      joinTitle: 'Join shared room',
      joining: 'Joining room...',
      leave: 'Leave room',
      members: 'Members',
      modeDriver: 'Driver',
      modeMultiEditor: 'Multi-editor',
      modeViewer: 'Viewer',
      noEditorAvailable: 'Promote a member to editor before using driver mode.',
      notAuthenticated: 'Sign in with YunLeFun to use cloud rooms.',
      owner: 'Owner',
      ownerTools: 'Owner controls',
      readOnly: 'Read-only',
      readOnlyBlocked: 'This shared room is read-only. Download or save a copy before editing.',
      readOnlyTitle: 'Room is read-only',
      revisionConflict: 'The room changed remotely. Sync finished; try the command again.',
      roleEditor: 'Editor',
      roleOwner: 'Owner',
      roleViewer: 'Viewer',
      roomNotFound: 'Room not found or the invite link expired.',
      roomMode: 'Room mode',
      saveRoomMode: 'Save mode',
      setRoleEditor: 'Set as editor',
      setRoleViewer: 'Set as viewer',
      share: 'Share',
      shareFailed: 'Could not share this room link.',
      shareLink: 'Share link',
      shareTitle: 'Saier shared canvas',
      signIn: 'Sign in',
      status: 'Room active',
      title: 'Cloud room',
      tooLarge: 'The project is larger than the room snapshot limit.',
    },
    menu: {
      file: 'File',
      activities: 'Activities',
      newCanvas: 'New canvas',
      openProject: 'Open project',
      saveProject: 'Save project',
      cloudSync: 'Cloud sync...',
      cloudRoom: 'Cloud room...',
      importBrush: 'Import brush...',
      importImage: 'Import image',
      exportPreview: 'Preview export',
      download: 'Download PNG',
      edit: 'Edit',
      undo: 'Undo',
      redo: 'Redo',
      view: 'View',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      language: 'Language',
      appearance: 'Appearance',
      themeSystem: 'Follow system',
      themeLight: 'Light',
      themeDark: 'Dark',
      others: 'Others',
      keyboardShortcuts: 'Keyboard Shortcuts...',
      filter: 'Filter',
      repeatFilter: 'Repeat filter',
      adjustments: 'Adjustments',
      invert: 'Invert',
      grayscale: 'Grayscale',
      blur: 'Blur',
      gaussianBlur: 'Gaussian blur...',
      pixelate: 'Pixelate...',
      window: 'Window',
      showPanels: 'Show panels',
      showColorPanels: 'Show color panels',
      collapsePanel: 'Collapse panel',
      detachPanel: 'Detach panel',
      expandPanel: 'Expand panel',
      hidePanel: 'Hide panel',
      brushOptionsPanel: 'Brush options',
      operationPanel: 'Controls',
      layerPanel: 'Layers',
      navigatorPanel: 'Navigator',
      diagnosticsPanel: 'Diagnostics',
      colorWheelPanel: 'Color wheel',
      colorPalettePanel: 'Palette',
      rgbSlidersPanel: 'RGB sliders',
      tools: 'Tools',
      brush: 'Brush',
      eraser: 'Eraser',
      pan: 'Pan',
      image: 'Image',
      selection: 'Selection',
      recordingStart: 'Start stroke recording',
      recordingStop: 'Stop stroke recording',
      recordingReplay: 'Replay last stroke',
      recordingClear: 'Clear recorded strokes',
      layers: 'Layers',
      addLayer: 'New layer',
      addGroup: 'New group',
      showActiveLayer: 'Show active layer',
      moveActiveLayerUp: 'Move active layer up',
      moveActiveLayerDown: 'Move active layer down',
      removeActiveLayer: 'Delete active layer',
    },
    navigator: {
      empty: 'No preview',
      panCanvas: 'Pan canvas',
      refresh: 'Refresh preview',
      resetView: 'Reset view',
      title: 'Navigator',
    },
    recording: {
      closePreview: 'Close replay preview',
      emptyHint: 'Start recording, then draw to create a replay',
      exportFailed: 'Could not export the stroke log.',
      exportLog: 'Export stroke log',
      importFailed: 'Could not import this stroke log.',
      importLog: 'Import stroke log',
      imported: 'Stroke log imported',
      invalidLog: 'The selected file is not a valid Saier stroke log.',
      pause: 'Pause replay',
      play: 'Play replay',
      position: 'Replay position',
      previewActive: 'Replay preview · original canvas is unchanged',
      reset: 'Reset replay position',
      speed: 'Replay speed',
      step: 'Step replay',
    },
    shortcuts: {
      title: 'Keyboard Shortcuts',
      search: 'Search',
      searchPlaceholder: 'Search commands',
      resetDefaults: 'Reset defaults',
      close: 'Close',
      category: 'Category',
      command: 'Command',
      shortcut: 'Shortcut',
      noResults: 'No shortcuts found',
      unassigned: 'Unassigned',
      categories: {
        app: 'App',
        brush: 'Brush',
        edit: 'Edit',
        file: 'File',
        filter: 'Filter',
        layers: 'Layers',
        recording: 'Recording',
        selection: 'Selection',
        tools: 'Tools',
        view: 'View',
      },
      commands: {
        'app:keyboard-shortcuts': 'Keyboard Shortcuts',
        'brush:size-down': 'Decrease brush size',
        'brush:size-up': 'Increase brush size',
        'edit:redo': 'Redo',
        'edit:undo': 'Undo',
        'file:download': 'Download PNG',
        'file:cloud-room': 'Cloud room',
        'file:cloud-sync': 'Cloud sync',
        'file:export-preview': 'Preview export',
        'file:import-brush': 'Import brush',
        'file:import-image': 'Import image',
        'file:new': 'New canvas',
        'file:open-project': 'Open project',
        'file:save-project': 'Save project',
        'filter:grayscale': 'Grayscale',
        'filter:invert': 'Invert',
        'filter:repeat': 'Repeat filter',
        'layer:add': 'New layer',
        'layer:add-group': 'New layer group',
        'layer:move-down': 'Move active layer down',
        'layer:move-up': 'Move active layer up',
        'layer:remove': 'Delete active layer',
        'recording:toggle': 'Toggle stroke recording',
        'recording:replay-last': 'Replay last stroke',
        'recording:clear': 'Clear recorded strokes',
        'recording:export-log': 'Export stroke log',
        'recording:import-log': 'Import stroke log',
        'recording:pause': 'Pause replay',
        'recording:play': 'Play replay',
        'recording:close-preview': 'Close replay preview',
        'recording:seek-start': 'Reset replay position',
        'recording:step-forward': 'Step replay',
        'selection:cancel': 'Cancel selection',
        'tool:brush': 'Brush',
        'tool:drag': 'Pan',
        'tool:eraser': 'Eraser',
        'tool:image': 'Image',
        'tool:selection': 'Selection',
        'view:reset': 'Reset view',
        'view:zoom-in': 'Zoom in',
        'view:zoom-out': 'Zoom out',
      },
    },
    status: {
      ready: 'Ready',
      tool: 'Tool',
      layer: 'Layer',
      noLayer: 'No layer',
    },
    controls: {
      backgroundColor: 'Background color',
      blue: 'Blue',
      brush: 'Brush',
      colorPicker: 'Color picker',
      eraser: 'Eraser',
      foregroundColor: 'Brush color',
      green: 'Green',
      hex: 'Hex',
      hue: 'Hue',
      image: 'Import image',
      palette: 'Palette',
      red: 'Red',
      selection: 'Selection',
      saturation: 'Saturation',
      value: 'Value',
      clear: 'Clear',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      extract: 'Preview export',
      download: 'Download',
      undo: 'Undo',
      redo: 'Redo',
    },
    brushOptions: {
      pressure: 'Pressure',
      stabilizer: 'Stabilizer',
      size: 'Size',
      opacity: 'Opacity',
      spacing: 'Spacing',
      hardness: 'Hard',
      flow: 'Flow',
      smudge: 'Pickup',
      colorAmount: 'Color',
      dilution: 'Dilution',
      persistence: 'Persistence',
      wetEdge: 'Wet edge',
      density: 'Density',
      paperTexture: 'Paper',
      paperTextureStrength: 'Grain',
      missingEngine: 'External brush engine is not loaded',
      requiresTileBackend: 'Requires tiled backend',
      unavailablePreset: 'Preset unavailable',
      addBrush: 'Save current brush',
      addGroup: 'New brush group',
      brushGroups: 'Brush groups',
      brushPresets: 'Brush presets',
      customBrush: 'Custom',
      customGroupName: 'Custom Group',
      groupLabels: {
        Sketching: 'Sketching',
        Inking: 'Inking',
        Painting: 'Painting',
        Blending: 'Blending',
      },
      removeBrush: 'Remove custom brush',
      removeGroup: 'Remove brush group',
      presetLabels: {
        pen: 'Pen',
        pencil: 'Pencil',
        marker: 'Marker',
        airbrush: 'Airbrush',
        calligraphy: 'Calligraphy',
        smudge: 'Smudge',
        blender: 'Blender',
        watercolor: 'Watercolor',
      },
    },
    memory: {
      browser: 'Browser',
      diagnostics: 'Diagnostics',
      estimated: 'estimated',
      event: 'Event',
      input: 'Input',
      inputDevice: 'Device',
      inputDrawing: 'Drawing',
      inputNo: 'No',
      inputPressure: 'Pressure',
      inputSamples: 'Samples / coalesced',
      inputTilt: 'Tilt / twist',
      inputYes: 'Yes',
      status: 'Memory',
      surface: 'Surface',
      total: 'Estimated',
      undo: 'Undo',
      unavailable: 'Unavailable',
      risk: {
        normal: 'Normal',
        watch: 'Watch',
        high: 'High',
      },
    },
    documents: {
      tabs: 'Files',
      newCanvas: 'New canvas',
      closeDocument: 'Close file',
      title: 'New canvas',
      name: 'Name',
      width: 'Width',
      height: 'Height',
      preset: 'Preset',
      custom: 'Custom',
      preview: 'Canvas preview',
      aspectRatio: 'Ratio',
      create: 'Create',
      cancel: 'Cancel',
      size: 'Size',
      invalidSize: 'Use whole pixels from 64 to 8192.',
      unsavedChangesTitle: 'Unsaved changes',
      unsavedChangesConfirm: 'This file has unsaved changes. Discard them?',
      discardChanges: 'Discard',
      defaultName: 'Canvas',
      draftRecovery: {
        close: 'Discard draft',
        discard: 'Discard draft',
        file: 'File',
        message: 'A browser draft was found from your last session.',
        restore: 'Restore draft',
        size: 'Canvas',
        title: 'Recover unsaved work',
        updatedAt: 'Saved',
        unknownName: 'Untitled draft',
      },
      presets: {
        square512: 'Square 512',
        square1024: 'Square 1024',
        hd: 'HD 16:9',
        portrait: 'Portrait 9:16',
        a4: 'A4 300dpi',
        large4096: 'Large 4096',
      },
    },
    layers: {
      title: 'Layers',
      addLayer: 'Add layer',
      addGroup: 'Add group',
      hideLayer: 'Hide layer',
      showLayer: 'Show layer',
      moveUp: 'Move up',
      moveDown: 'Move down',
      moveIn: 'Move into group below',
      moveOut: 'Move out of group',
      removeLayer: 'Remove layer',
      ungroup: 'Ungroup',
      collapseGroup: 'Collapse group',
      expandGroup: 'Expand group',
      addMask: 'Add layer mask',
      removeMask: 'Remove layer mask',
      enableMask: 'Enable layer mask',
      disableMask: 'Disable layer mask',
      paintContent: 'Paint layer content',
      paintMask: 'Paint layer mask',
      defaultLayerName: 'Layer',
      defaultGroupName: 'Group',
      blendModes: {
        normal: 'Normal',
        multiply: 'Multiply',
        screen: 'Screen',
        overlay: 'Overlay',
        darken: 'Darken',
        lighten: 'Lighten',
        add: 'Add',
      },
    },
  },
  zh: {
    appName: '赛尔画板',
    tagline: '在线绘画工作台',
    language: '语言',
    exportPreview: '导出预览',
    closePreview: '关闭预览',
    loading: '画板加载中...',
    notices: {
      close: '关闭',
      projectDraftClearFailed: '无法丢弃本地草稿。',
      projectDraftReadFailed: '无法读取本地草稿。',
      projectDraftRestoreFailed: '无法恢复本地草稿。',
      projectDraftSaveFailed: '无法保存本地草稿。',
      brushPresetMissingEngine: '这个预设依赖的外部笔刷引擎尚未加载。',
      brushPresetRequiresSampler: '这个笔刷需要画布取色采样；请使用 tile 后端后再选择涂抹 / 水彩类笔刷。',
      brushPresetUnavailable: '笔刷不可用',
      brushImportFailed: '无法导入这个笔刷。',
      brushImportInvalidMyPaint: '这个 .myb 文件不像有效的 MyPaint 笔刷预设。',
      brushImportSavedLocally: '笔刷已导入本地，但云同步失败。',
      brushImportSucceeded: '笔刷已导入',
      brushImportUnsupported: '请导入 MyPaint .myb 笔刷文件。',
      brushImportUnsupportedSai: 'SAI 笔刷预设暂时没有开放导入格式；请先导入 MyPaint .myb。',
      projectImportFailed: '无法打开这个工程。',
      projectImportInvalidJson: '所选文件不是有效 JSON。',
      projectImportInvalidProject: '这个 JSON 不是有效的赛尔工程。',
      projectImportReadFailed: '无法读取所选文件。',
    },
    account: {
      checking: '同步中',
      error: '账户异常',
      nativeApp: '云乐坊 App',
      openSettings: '打开云乐坊账户设置',
      signIn: '登录',
      signedIn: '已登录',
      signingIn: '登录中',
    },
    activities: {
      close: '关闭活动',
      loadFailed: 'Activity 插件加载失败，请稍后重试。',
      loading: '正在加载 Activity…',
      unavailable: '这个 Activity 插件不可用。',
    },
    cloudFiles: {
      brushLibrary: '笔刷库',
      brushLibraryCount: '笔刷数',
      brushLibraryEmpty: '暂无已同步的自定义笔刷',
      brushLibrarySync: '同步笔刷',
      brushLibrarySynced: '上次同步',
      brushLibrarySyncing: '正在同步笔刷...',
      checkingQuota: '正在检查云空间...',
      close: '关闭',
      confirmRemove: '删除这个云端文件？',
      deleting: '删除中...',
      downloadFailed: '云端文件下载失败。',
      downloading: '读取中...',
      empty: '暂无云端文件',
      finalizing: '正在确认上传...',
      invalidLibrary: '这个云端文件不是有效的赛尔笔刷库。',
      invalidProject: '这个云端文件不是有效的赛尔工程。',
      load: '载入',
      loading: '正在加载文件...',
      maxFileSize: '文件上限',
      memberPlan: '会员云空间',
      name: '名称',
      missingDatabase: '云端文件索引不可用，请检查 CloudBase 集合与权限。',
      missingStorage: '云存储不可用，请检查 CloudBase 存储安全域名。',
      normalPlan: '普通云空间',
      notAuthenticated: '登录云乐坊后可同步文件。',
      quotaAvailable: '可用',
      quotaExceeded: '云乐坊云空间不足，无法上传这个文件。',
      quotaUsed: '已用',
      recentFiles: '最近文件',
      refresh: '刷新',
      renaming: '重命名中...',
      rename: '重命名',
      renameFailed: '云端文件重命名失败。',
      remove: '删除',
      reservationExpired: '上传预留已过期，请重试。',
      saveRename: '保存名称',
      signIn: '登录',
      signInRequired: '登录云乐坊后可使用共享云空间。',
      size: '大小',
      title: '云同步',
      tooLarge: '工程文件超过 200 MB。',
      updated: '更新时间',
      uploadCurrent: '上传当前文件',
      uploading: '上传中...',
    },
    cloudRooms: {
      backendGated: '需要部署 saier-room-api 后端。前端入口已接好，真实共享依赖后端上线。',
      backendUnavailable: '云端房间后端暂不可用，请先部署 saier-room-api。',
      close: '关闭',
      copyFailed: '房间链接复制失败。',
      copyLink: '复制链接',
      copySucceeded: '房间链接已复制',
      create: '创建房间',
      createTitle: '从当前画布创建',
      creating: '正在创建房间...',
      driverEditor: '主控编辑者',
      errorTitle: '云端房间错误',
      forbidden: '你没有权限访问这个房间。',
      invalidSnapshot: '房间快照不是有效的赛尔工程。',
      join: '加入房间',
      joinInput: '房间链接或 ID',
      joinTitle: '加入共享房间',
      joining: '正在加入房间...',
      leave: '离开房间',
      members: '成员',
      modeDriver: '主控',
      modeMultiEditor: '多人编辑',
      modeViewer: '观看',
      noEditorAvailable: '先把成员设为编辑者后才能使用主控模式。',
      notAuthenticated: '登录云乐坊后可使用云端房间。',
      owner: '房主',
      ownerTools: '房主管理',
      readOnly: '只读',
      readOnlyBlocked: '当前共享房间为只读，请下载或另存副本后再编辑。',
      readOnlyTitle: '房间为只读',
      revisionConflict: '房间已被远端更新，同步完成后请重试该操作。',
      roleEditor: '编辑者',
      roleOwner: '房主',
      roleViewer: '观看者',
      roomNotFound: '房间不存在或邀请链接已失效。',
      roomMode: '房间模式',
      saveRoomMode: '保存模式',
      setRoleEditor: '设为编辑者',
      setRoleViewer: '设为观看者',
      share: '分享',
      shareFailed: '房间链接分享失败。',
      shareLink: '分享链接',
      shareTitle: 'Saier 共享画布',
      signIn: '登录',
      status: '房间已连接',
      title: '云端房间',
      tooLarge: '工程文件超过房间快照上限。',
    },
    menu: {
      file: '文件',
      activities: '活动',
      newCanvas: '新建画布',
      openProject: '打开工程',
      saveProject: '保存工程',
      cloudSync: '云同步...',
      cloudRoom: '云端房间...',
      importBrush: '导入笔刷...',
      importImage: '导入图片',
      exportPreview: '预览导出',
      download: '下载 PNG',
      edit: '编辑',
      undo: '撤销',
      redo: '重做',
      view: '视图',
      zoomIn: '放大',
      zoomOut: '缩小',
      language: '语言',
      appearance: '外观',
      themeSystem: '跟随系统',
      themeLight: '亮色',
      themeDark: '暗色',
      others: '其他',
      keyboardShortcuts: '快捷键设置...',
      filter: '滤镜',
      repeatFilter: '上次滤镜',
      adjustments: '调整',
      invert: '反相',
      grayscale: '灰度',
      blur: '模糊',
      gaussianBlur: '高斯模糊...',
      pixelate: '像素化...',
      window: '窗口',
      showPanels: '显示操作面板',
      showColorPanels: '显示颜色面板',
      collapsePanel: '折叠面板',
      detachPanel: '分离面板',
      expandPanel: '展开面板',
      hidePanel: '隐藏面板',
      brushOptionsPanel: '画笔参数',
      operationPanel: '操作面板',
      layerPanel: '图层面板',
      navigatorPanel: '导航器',
      diagnosticsPanel: '诊断面板',
      colorWheelPanel: '色轮',
      colorPalettePanel: '色板',
      rgbSlidersPanel: 'RGB 滑块',
      tools: '工具',
      brush: '画笔',
      eraser: '橡皮擦',
      pan: '平移',
      image: '图片',
      selection: '选择',
      recordingStart: '开始笔迹录制',
      recordingStop: '停止笔迹录制',
      recordingReplay: '回放上一笔',
      recordingClear: '清空录制笔迹',
      layers: '图层',
      addLayer: '新建图层',
      addGroup: '新建图层组',
      showActiveLayer: '显示当前图层',
      moveActiveLayerUp: '当前图层上移',
      moveActiveLayerDown: '当前图层下移',
      removeActiveLayer: '删除当前图层',
    },
    navigator: {
      empty: '暂无预览',
      panCanvas: '平移画布',
      refresh: '刷新预览',
      resetView: '重置视图',
      title: '导航器',
    },
    recording: {
      closePreview: '关闭回放预览',
      emptyHint: '先开启录制，再绘制笔迹即可回放',
      exportFailed: '无法导出笔迹日志。',
      exportLog: '导出笔迹日志',
      importFailed: '无法导入这个笔迹日志。',
      importLog: '导入笔迹日志',
      imported: '笔迹日志已导入',
      invalidLog: '所选文件不是有效的赛尔笔迹日志。',
      pause: '暂停回放',
      play: '播放回放',
      position: '回放位置',
      previewActive: '回放预览中 · 原画布不会被修改',
      reset: '重置回放位置',
      speed: '回放速度',
      step: '步进回放',
    },
    shortcuts: {
      title: '快捷键设置',
      search: '搜索',
      searchPlaceholder: '搜索命令',
      resetDefaults: '恢复默认',
      close: '关闭',
      category: '分类',
      command: '命令',
      shortcut: '快捷键',
      noResults: '没有匹配的快捷键',
      unassigned: '未分配',
      categories: {
        app: '应用',
        brush: '画笔',
        edit: '编辑',
        file: '文件',
        filter: '滤镜',
        layers: '图层',
        recording: '笔迹录制',
        selection: '选择',
        tools: '工具',
        view: '视图',
      },
      commands: {
        'app:keyboard-shortcuts': '快捷键设置',
        'brush:size-down': '减小画笔大小',
        'brush:size-up': '增大画笔大小',
        'edit:redo': '重做',
        'edit:undo': '撤销',
        'file:download': '下载 PNG',
        'file:cloud-room': '云端房间',
        'file:cloud-sync': '云同步',
        'file:export-preview': '预览导出',
        'file:import-brush': '导入笔刷',
        'file:import-image': '导入图片',
        'file:new': '新建画布',
        'file:open-project': '打开工程',
        'file:save-project': '保存工程',
        'filter:grayscale': '灰度',
        'filter:invert': '反相',
        'filter:repeat': '上次滤镜',
        'layer:add': '新建图层',
        'layer:add-group': '新建图层组',
        'layer:move-down': '当前图层下移',
        'layer:move-up': '当前图层上移',
        'layer:remove': '删除当前图层',
        'recording:toggle': '切换笔迹录制',
        'recording:replay-last': '回放上一笔',
        'recording:clear': '清空录制笔迹',
        'recording:export-log': '导出笔迹日志',
        'recording:import-log': '导入笔迹日志',
        'recording:pause': '暂停回放',
        'recording:play': '播放回放',
        'recording:close-preview': '关闭回放预览',
        'recording:seek-start': '重置回放位置',
        'recording:step-forward': '步进回放',
        'selection:cancel': '取消选择',
        'tool:brush': '画笔',
        'tool:drag': '平移',
        'tool:eraser': '橡皮擦',
        'tool:image': '图片',
        'tool:selection': '选择',
        'view:reset': '重置视图',
        'view:zoom-in': '放大',
        'view:zoom-out': '缩小',
      },
    },
    status: {
      ready: '就绪',
      tool: '工具',
      layer: '图层',
      noLayer: '无图层',
    },
    controls: {
      backgroundColor: '背景色',
      blue: '蓝',
      brush: '画笔',
      colorPicker: '颜色选择器',
      eraser: '橡皮擦',
      foregroundColor: '画笔颜色',
      green: '绿',
      hex: 'Hex',
      hue: '色相',
      image: '导入图片',
      palette: '色板',
      red: '红',
      selection: '选择',
      saturation: '饱和度',
      value: '明度',
      clear: '清空',
      zoomIn: '放大',
      zoomOut: '缩小',
      extract: '预览导出',
      download: '下载',
      undo: '撤销',
      redo: '重做',
    },
    brushOptions: {
      pressure: '压感',
      stabilizer: '抖动修正',
      size: '大小',
      opacity: '不透明度',
      spacing: '间距',
      hardness: '硬度',
      flow: '流量',
      smudge: '取色',
      colorAmount: '自色',
      dilution: '稀释',
      persistence: '留色',
      wetEdge: '湿边',
      density: '浓度',
      paperTexture: '纸纹',
      paperTextureStrength: '颗粒',
      missingEngine: '外部笔刷引擎尚未加载',
      requiresTileBackend: '需要 tile 后端',
      unavailablePreset: '当前无法使用此笔刷',
      addBrush: '保存当前画笔',
      addGroup: '新建画笔分组',
      brushGroups: '画笔分组',
      brushPresets: '画笔预设',
      customBrush: '自定义',
      customGroupName: '自定义分组',
      groupLabels: {
        Sketching: '草稿',
        Inking: '勾线',
        Painting: '绘画',
        Blending: '混色',
      },
      removeBrush: '删除自定义画笔',
      removeGroup: '删除画笔分组',
      presetLabels: {
        pen: '钢笔',
        pencil: '铅笔',
        marker: '马克笔',
        airbrush: '喷枪',
        calligraphy: '书法',
        smudge: '涂抹',
        blender: '混色',
        watercolor: '水彩',
      },
    },
    memory: {
      browser: '浏览器',
      diagnostics: '诊断',
      estimated: '估算',
      event: '事件',
      input: '输入',
      inputDevice: '设备',
      inputDrawing: '绘制中',
      inputNo: '否',
      inputPressure: '压感',
      inputSamples: '采样 / 合并',
      inputTilt: '倾斜 / 旋转',
      inputYes: '是',
      status: '内存',
      surface: '画布资源',
      total: '估算',
      undo: '撤销',
      unavailable: '不可用',
      risk: {
        normal: '正常',
        watch: '关注',
        high: '高',
      },
    },
    documents: {
      tabs: '文件',
      newCanvas: '新建画布',
      closeDocument: '关闭文件',
      title: '新建画布',
      name: '名称',
      width: '宽度',
      height: '高度',
      preset: '预设',
      custom: '自定义',
      preview: '画布预览',
      aspectRatio: '比例',
      create: '创建',
      cancel: '取消',
      size: '尺寸',
      invalidSize: '请输入 64 到 8192 的整数像素。',
      unsavedChangesTitle: '未保存的更改',
      unsavedChangesConfirm: '当前文件有未保存的更改，确定要丢弃吗？',
      discardChanges: '丢弃更改',
      defaultName: '画布',
      draftRecovery: {
        close: '丢弃草稿',
        discard: '丢弃草稿',
        file: '文件',
        message: '检测到上次会话留下的浏览器草稿。',
        restore: '恢复草稿',
        size: '画布',
        title: '恢复未保存内容',
        updatedAt: '保存时间',
        unknownName: '未命名草稿',
      },
      presets: {
        square512: '方形 512',
        square1024: '方形 1024',
        hd: '横屏 16:9',
        portrait: '竖屏 9:16',
        a4: 'A4 300dpi',
        large4096: '大画布 4096',
      },
    },
    layers: {
      title: '图层',
      addLayer: '新建图层',
      addGroup: '新建图层组',
      hideLayer: '隐藏图层',
      showLayer: '显示图层',
      moveUp: '上移',
      moveDown: '下移',
      moveIn: '移入下方图层组',
      moveOut: '移出图层组',
      removeLayer: '删除图层',
      ungroup: '解散图层组',
      collapseGroup: '折叠图层组',
      expandGroup: '展开图层组',
      addMask: '添加图层蒙版',
      removeMask: '删除图层蒙版',
      enableMask: '启用图层蒙版',
      disableMask: '停用图层蒙版',
      paintContent: '绘制图层内容',
      paintMask: '绘制图层蒙版',
      defaultLayerName: '图层',
      defaultGroupName: '图层组',
      blendModes: {
        normal: '正常',
        multiply: '正片叠底',
        screen: '滤色',
        overlay: '叠加',
        darken: '变暗',
        lighten: '变亮',
        add: '添加',
      },
    },
  },
}

const locale = shallowRef<SiteLocale>('zh')
let isInitialized = false

export function useSiteI18n() {
  if (import.meta.client && !isInitialized) {
    isInitialized = true
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isSiteLocale(stored))
      locale.value = stored
    else if (!navigator.language.toLowerCase().startsWith('zh'))
      locale.value = 'en'
  }

  const text = computed(() => messages[locale.value])
  const currentLocaleOption = computed(() => localeOptionFor(locale.value))
  const htmlLang = computed(() => currentLocaleOption.value.htmlLang)

  function setLocale(value: SiteLocale): void {
    locale.value = value
    if (import.meta.client)
      window.localStorage.setItem(STORAGE_KEY, value)
  }

  return {
    currentLocaleOption,
    htmlLang,
    locale,
    localeOptions: SITE_LOCALE_OPTIONS,
    setLocale,
    text,
  }
}

function isSiteLocale(value: string | null): value is SiteLocale {
  return SITE_LOCALE_OPTIONS.some(option => option.code === value)
}

function localeOptionFor(value: SiteLocale): SiteLocaleOption {
  return SITE_LOCALE_OPTIONS.find(option => option.code === value) ?? SITE_LOCALE_OPTIONS[0]
}
