import rawMainCpp from '../../main.cpp?raw';
import rawBuildBat from '../../build.bat?raw';
import rawGithubWorkflow from '../../.github/workflows/build-exe.yml?raw';

export const MAIN_CPP_SOURCE = rawMainCpp;
export const BUILD_BAT_SOURCE = rawBuildBat;
export const GITHUB_WORKFLOW_SOURCE = rawGithubWorkflow;

export function toWindowsCrLf(text: string): string {
  return text.replace(/\r?\n/g, '\r\n');
}

export function createSelfExtractingLauncherBat(): string {
  // Normalize main.cpp to CRLF before Base64 encoding
  const cppCrLf = toWindowsCrLf(MAIN_CPP_SOURCE);
  const bytes = new TextEncoder().encode(cppCrLf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64Full = btoa(binary);

  // Split Base64 into safe 76-character lines so cmd.exe never hits its 8191-char line limit
  const chunks: string[] = [];
  for (let i = 0; i < base64Full.length; i += 76) {
    chunks.push('echo ' + base64Full.slice(i, i + 76));
  }

  const cleanBuildSteps = BUILD_BAT_SOURCE.replace(/^@echo off\r?\nsetlocal EnableDelayedExpansion\r?\n/, '');

  const batScript = `@echo off
setlocal EnableDelayedExpansion
title One-Click PepperLib.exe v1.2 Self-Extracting Builder

cd /d "%~dp0"
echo ============================================================================
echo  Extracting embedded main.cpp (Base64 chunked) and building PepperLib.exe v1.2
echo ============================================================================

(
echo -----BEGIN CERTIFICATE-----
${chunks.join('\n')}
echo -----END CERTIFICATE-----
) > "main.b64"

certutil -decode -f "main.b64" "main.cpp" >nul
if errorlevel 1 (
    echo [ERROR] Failed to decode embedded main.cpp
    pause
    exit /b 1
)
del /q "main.b64"

${cleanBuildSteps}`;

  return toWindowsCrLf(batScript);
}

export interface SimulatedImageFile {
  id: string;
  fileName: string;
  extension: string;
  isSubfolder: boolean;
  folder: string;
  fullPath: string;
  lastWriteTimeTicks: number;
  dateCreatedHuman: string;
  lastModifiedHuman: string;
  dimensions: string;
  fileSizeKb: number;
  ocrText: string;
  accentColor: string;
  category: 'Folder' | 'Image' | 'PDF' | 'Text' | 'Markdown' | 'CSV' | 'JSON';
  isPcCatalogOnly?: boolean;
  isWindowsImportantFile?: boolean;
}

export const SIMULATED_FOLDERS: Record<string, SimulatedImageFile[]> = {
  'C:\\Users\\Engineer\\Desktop': [
    {
      id: 'desk-1',
      fileName: 'Board_Bringup_Screenshot_2026.png',
      extension: '.png',
      isSubfolder: false,
      folder: 'C:\\Users\\Engineer\\Desktop',
      fullPath: 'C:\\Users\\Engineer\\Desktop\\Board_Bringup_Screenshot_2026.png',
      lastWriteTimeTicks: 134205100000000000,
      dateCreatedHuman: '2026-10-06 08:15',
      lastModifiedHuman: '2026-10-06 08:15',
      dimensions: '2560x1440',
      fileSizeKb: 740,
      ocrText: 'UART0 Bootloader v2.4 DDR5 Training Passed 6400MT/s PCIe Root Complex Link Up Gen5 x16 Ready',
      accentColor: '#0284C7',
      category: 'Image',
    },
    {
      id: 'desk-2',
      fileName: 'Desktop_Quick_Notes.txt',
      extension: '.txt',
      isSubfolder: false,
      folder: 'C:\\Users\\Engineer\\Desktop',
      fullPath: 'C:\\Users\\Engineer\\Desktop\\Desktop_Quick_Notes.txt',
      lastWriteTimeTicks: 134205200000000000,
      dateCreatedHuman: '2026-10-06 09:30',
      lastModifiedHuman: '2026-10-06 09:42',
      dimensions: 'UTF-8 · TXT',
      fileSizeKb: 12,
      ocrText: 'Desktop checklist: verify OneDrive Desktop and local Desktop folder indexing, test Ctrl+A select all, and verify Exclude windows important file option.',
      accentColor: '#475569',
      category: 'Text',
    },
    {
      id: 'desk-3',
      fileName: 'Architecture_Signoff_2026.pdf',
      extension: '.pdf',
      isSubfolder: false,
      folder: 'C:\\Users\\Engineer\\Desktop',
      fullPath: 'C:\\Users\\Engineer\\Desktop\\Architecture_Signoff_2026.pdf',
      lastWriteTimeTicks: 134205300000000000,
      dateCreatedHuman: '2026-10-06 10:05',
      lastModifiedHuman: '2026-10-06 10:05',
      dimensions: '4 Pages · PDF',
      fileSizeKb: 530,
      ocrText: 'Engineering Sign-off Document: Approved for Q4 manufacturing release. Signed by Lead Systems Architect.',
      accentColor: '#DC2626',
      category: 'PDF',
    },
    {
      id: 'desk-win-1',
      fileName: 'desktop.ini',
      extension: '.txt',
      isSubfolder: false,
      folder: 'C:\\Users\\Engineer\\Desktop',
      fullPath: 'C:\\Users\\Engineer\\Desktop\\desktop.ini',
      lastWriteTimeTicks: 134190000000000000,
      dateCreatedHuman: '2026-01-10 08:00',
      lastModifiedHuman: '2026-01-10 08:00',
      dimensions: 'Windows Shell Metadata',
      fileSizeKb: 1,
      ocrText: '[.ShellClassInfo] LocalizedResourceName=@%SystemRoot%\\system32\\shell32.dll,-21769',
      accentColor: '#64748B',
      category: 'Text',
      isWindowsImportantFile: true,
    },
  ],
  'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026': [
    {
      id: 'dir-1',
      fileName: 'Subfolder_Diagrams',
      extension: '<DIR>',
      isSubfolder: false,
      folder: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026',
      fullPath: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026\\Subfolder_Diagrams',
      lastWriteTimeTicks: 134199442000000000,
      dateCreatedHuman: '2026-09-24 12:00',
      lastModifiedHuman: '2026-09-24 16:48',
      dimensions: 'File Folder',
      fileSizeKb: 0,
      ocrText: '[Folder]',
      accentColor: '#F59E0B',
      category: 'Folder',
    },
    {
      id: 'dir-2',
      fileName: 'Subfolder_Finances',
      extension: '<DIR>',
      isSubfolder: false,
      folder: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026',
      fullPath: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026\\Subfolder_Finances',
      lastWriteTimeTicks: 134199890000000000,
      dateCreatedHuman: '2026-09-25 16:00',
      lastModifiedHuman: '2026-09-26 11:05',
      dimensions: 'File Folder',
      fileSizeKb: 0,
      ocrText: '[Folder]',
      accentColor: '#F59E0B',
      category: 'Folder',
    },
    {
      id: 'dir-3',
      fileName: 'Subfolder_Docs',
      extension: '<DIR>',
      isSubfolder: false,
      folder: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026',
      fullPath: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026\\Subfolder_Docs',
      lastWriteTimeTicks: 134200800000000000,
      dateCreatedHuman: '2026-09-29 09:00',
      lastModifiedHuman: '2026-09-30 15:20',
      dimensions: 'File Folder',
      fileSizeKb: 0,
      ocrText: '[Folder]',
      accentColor: '#F59E0B',
      category: 'Folder',
    },
    {
      id: 'item-1',
      fileName: 'INV_2026_0419_CloudGPU.png',
      extension: '.png',
      isSubfolder: false,
      folder: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026',
      fullPath: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026\\INV_2026_0419_CloudGPU.png',
      lastWriteTimeTicks: 134198214000000000,
      dateCreatedHuman: '2026-09-18 09:10',
      lastModifiedHuman: '2026-09-18 14:22',
      dimensions: '1920x1080',
      fileSizeKb: 412,
      ocrText: 'INVOICE #INV-2026-0419 Bill To: Apex Systems Engineering Dedicated H200 Tensor Cluster 64x NVLink Nodes Subtotal $18,450.00 Paid via Wire Transfer Auth Code 99481A',
      accentColor: '#0284C7',
      category: 'Image',
    },
    {
      id: 'item-2',
      fileName: 'System_Architecture_Spec_v4.pdf',
      extension: '.pdf',
      isSubfolder: false,
      folder: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026',
      fullPath: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026\\System_Architecture_Spec_v4.pdf',
      lastWriteTimeTicks: 134198650000000000,
      dateCreatedHuman: '2026-09-19 08:30',
      lastModifiedHuman: '2026-09-19 10:15',
      dimensions: '12 Pages · PDF',
      fileSizeKb: 1420,
      ocrText: 'PepperLib Architecture Specification: Windows.Data.Pdf PdfDocument Page Rendering + Windows.Media.Ocr Multi-Threaded Apartment SQLite FTS5 Virtual Table %APPDATA%\\pepperlib',
      accentColor: '#DC2626',
      category: 'PDF',
    },
    {
      id: 'item-3',
      fileName: 'Kernel_Panic_Dump_Win11_24H2.jpg',
      extension: '.jpg',
      isSubfolder: false,
      folder: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026',
      fullPath: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026\\Kernel_Panic_Dump_Win11_24H2.jpg',
      lastWriteTimeTicks: 134198981000000000,
      dateCreatedHuman: '2026-09-21 09:00',
      lastModifiedHuman: '2026-09-21 09:04',
      dimensions: '2560x1440',
      fileSizeKb: 685,
      ocrText: 'Stop Code: DRIVER_IRQL_NOT_LESS_OR_EQUAL What failed: nvlddmkm.sys Address FFFFF8057A210940 BugCheck 0x000000D1 Collecting crash dump 100% complete',
      accentColor: '#DC2626',
      category: 'Image',
    },
    {
      id: 'item-4',
      fileName: 'Release_Notes_2026_Q4.txt',
      extension: '.txt',
      isSubfolder: false,
      folder: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026',
      fullPath: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026\\Release_Notes_2026_Q4.txt',
      lastWriteTimeTicks: 134199210000000000,
      dateCreatedHuman: '2026-09-22 14:00',
      lastModifiedHuman: '2026-09-22 18:10',
      dimensions: 'UTF-8 · TXT',
      fileSizeKb: 24,
      ocrText: 'PepperLib v3.0 Release Notes: Added PC-wide filename catalog, Detailed View with right-click column toggles, Option button menu, always-available Pause button, and right-click item actions.',
      accentColor: '#475569',
      category: 'Text',
    },
    {
      id: 'item-5',
      fileName: 'Whiteboard_ZeroCopy_IPC_Design.png',
      extension: '.png',
      isSubfolder: true,
      folder: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026\\Subfolder_Diagrams',
      fullPath: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026\\Subfolder_Diagrams\\Whiteboard_ZeroCopy_IPC_Design.png',
      lastWriteTimeTicks: 134199442000000000,
      dateCreatedHuman: '2026-09-24 12:15',
      lastModifiedHuman: '2026-09-24 16:48',
      dimensions: '3840x2160',
      fileSizeKb: 1290,
      ocrText: 'Shared Memory RingBuffer CreateFileMappingW MapViewOfFile Lock-Free SPSC Queue Producer Consumer Latency < 850ns Cache Line 64B Alignment',
      accentColor: '#059669',
      category: 'Image',
    },
    {
      id: 'item-6',
      fileName: 'Hardware_BOM_Q4_Suppliers.csv',
      extension: '.csv',
      isSubfolder: true,
      folder: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026\\Subfolder_Finances',
      fullPath: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026\\Subfolder_Finances\\Hardware_BOM_Q4_Suppliers.csv',
      lastWriteTimeTicks: 134199890000000000,
      dateCreatedHuman: '2026-09-25 16:40',
      lastModifiedHuman: '2026-09-26 11:05',
      dimensions: '140 Rows · CSV',
      fileSizeKb: 68,
      ocrText: 'PartNumber,Manufacturer,Description,UnitPrice,LeadTime STM32H753ZI6,STMicroelectronics,ARM Cortex-M7 480MHz MCU,$14.20,4 Weeks W25Q128JV,Winbond,128Mbit QSPI NOR Flash,$1.85,In Stock',
      accentColor: '#059669',
      category: 'CSV',
    },
    {
      id: 'item-7',
      fileName: 'Receipt_DigiKey_LogicAnalyzer.webp',
      extension: '.webp',
      isSubfolder: false,
      folder: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026',
      fullPath: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026\\Receipt_DigiKey_LogicAnalyzer.webp',
      lastWriteTimeTicks: 134200120000000000,
      dateCreatedHuman: '2026-09-28 10:02',
      lastModifiedHuman: '2026-09-28 11:15',
      dimensions: '1200x1600',
      fileSizeKb: 290,
      ocrText: 'Digi-Key Electronics Order #8849201 Saleae Logic Pro 16 Channel 500MS/s USB 3.0 FPGA Probe Kit Qty 2 Total $1,998.00 Shipped via FedEx Priority',
      accentColor: '#D97706',
      category: 'Image',
    },
    {
      id: 'item-8',
      fileName: 'API_Deployment_Runbook.md',
      extension: '.md',
      isSubfolder: true,
      folder: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026\\Subfolder_Docs',
      fullPath: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026\\Subfolder_Docs\\API_Deployment_Runbook.md',
      lastWriteTimeTicks: 134200800000000000,
      dateCreatedHuman: '2026-09-29 09:20',
      lastModifiedHuman: '2026-09-30 15:20',
      dimensions: 'Markdown · MD',
      fileSizeKb: 38,
      ocrText: '# Production Deployment Runbook Verify TLS 1.3 certificates, run sqlite3 WAL checkpoint PRAGMA wal_checkpoint(TRUNCATE), validate zero-downtime worker pool reload.',
      accentColor: '#0284C7',
      category: 'Markdown',
    },
    {
      id: 'item-9',
      fileName: 'Quarterly_Audit_Report_2026.pdf',
      extension: '.pdf',
      isSubfolder: false,
      folder: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026',
      fullPath: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026\\Quarterly_Audit_Report_2026.pdf',
      lastWriteTimeTicks: 134201500000000000,
      dateCreatedHuman: '2026-10-01 11:00',
      lastModifiedHuman: '2026-10-02 09:40',
      dimensions: '8 Pages · PDF',
      fileSizeKb: 950,
      ocrText: 'Q3/Q4 Security & Performance Audit Report: All static binaries verified with /MT CRT linking. Zero external runtime DLL dependencies found. Average FTS5 query latency 0.14ms.',
      accentColor: '#DC2626',
      category: 'PDF',
    },
    {
      id: 'item-10',
      fileName: 'Schematic_PCIe_Gen5_Retimer.bmp',
      extension: '.bmp',
      isSubfolder: false,
      folder: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026',
      fullPath: 'C:\\Users\\Engineer\\Documents\\Project_PepperLib_2026\\Schematic_PCIe_Gen5_Retimer.bmp',
      lastWriteTimeTicks: 134201880000000000,
      dateCreatedHuman: '2026-10-03 07:45',
      lastModifiedHuman: '2026-10-03 08:12',
      dimensions: '1920x1200',
      fileSizeKb: 1840,
      ocrText: 'PCIe 5.0 x16 Differential Pair 85 Ohm Impedance Astera Labs Aries Retimer REFCLK 100MHz PERST# 3.3V Aux Power Rail Decoupling Capacitors 0402 X7R',
      accentColor: '#0D9488',
      category: 'Image',
    },
  ],
  'D:\\Engineering_Captures\\Lab_Bench_2026': [
    {
      id: 'item-11',
      fileName: 'Oscilloscope_SPI_Clock_Jitter.png',
      extension: '.png',
      isSubfolder: false,
      folder: 'D:\\Engineering_Captures\\Lab_Bench_2026',
      fullPath: 'D:\\Engineering_Captures\\Lab_Bench_2026\\Oscilloscope_SPI_Clock_Jitter.png',
      lastWriteTimeTicks: 134203500000000000,
      dateCreatedHuman: '2026-10-02 09:50',
      lastModifiedHuman: '2026-10-02 10:15',
      dimensions: '1920x1080',
      fileSizeKb: 620,
      ocrText: 'Keysight InfiniiVision MSOX4154A CH1 SCLK 50.0MHz Rise Time 1.8ns Overshoot 4.2% MOSI MISO CS# Setup Time 6.4ns Hold Time 5.1ns TriggerSPI Frame',
      accentColor: '#059669',
      category: 'Image',
    },
    {
      id: 'item-12',
      fileName: 'Thermal_Calibration_Data.pdf',
      extension: '.pdf',
      isSubfolder: false,
      folder: 'D:\\Engineering_Captures\\Lab_Bench_2026',
      fullPath: 'D:\\Engineering_Captures\\Lab_Bench_2026\\Thermal_Calibration_Data.pdf',
      lastWriteTimeTicks: 134203800000000000,
      dateCreatedHuman: '2026-10-04 11:30',
      lastModifiedHuman: '2026-10-04 13:50',
      dimensions: '5 Pages · PDF',
      fileSizeKb: 780,
      ocrText: 'FLIR E8-XT Spot Temp 78.4 C Ambient 23.1 C Emissivity 0.95 DrMOS Phase 4 Inductor Saturation Test 320W Continuous Package Power',
      accentColor: '#DC2626',
      category: 'PDF',
    },
    {
      id: 'item-13',
      fileName: 'Bench_Config_Profile.json',
      extension: '.json',
      isSubfolder: true,
      folder: 'D:\\Engineering_Captures\\Lab_Bench_2026\\Profiles',
      fullPath: 'D:\\Engineering_Captures\\Lab_Bench_2026\\Profiles\\Bench_Config_Profile.json',
      lastWriteTimeTicks: 134204100000000000,
      dateCreatedHuman: '2026-10-05 16:10',
      lastModifiedHuman: '2026-10-05 17:05',
      dimensions: 'JSON Config',
      fileSizeKb: 18,
      ocrText: '{ "instrument": "Keysight_MSOX4154A", "sampleRateGHz": 5.0, "voltageRailV": 3.3, "triggerMode": "SPI_CS_FALLING_EDGE" }',
      accentColor: '#D97706',
      category: 'JSON',
    },
  ],
};

// Extra PC-Wide Filename Catalog entries (Indexed across C:\ and D:\ WITHOUT running OCR)
export const PC_WIDE_CATALOG_FILES: SimulatedImageFile[] = [
  {
    id: 'pc-101',
    fileName: 'Passport_Scan_2026_Renewal.png',
    extension: '.png',
    isSubfolder: false,
    folder: 'C:\\Users\\Engineer\\Desktop\\Personal_Scans',
    fullPath: 'C:\\Users\\Engineer\\Desktop\\Personal_Scans\\Passport_Scan_2026_Renewal.png',
    lastWriteTimeTicks: 134190000000000000,
    dateCreatedHuman: '2026-08-14 10:12',
    lastModifiedHuman: '2026-08-14 10:12',
    dimensions: 'Filename Catalog Only (No OCR)',
    fileSizeKb: 845,
    ocrText: '',
    accentColor: '#64748B',
    category: 'Image',
    isPcCatalogOnly: true,
  },
  {
    id: 'pc-102',
    fileName: 'Tax_Return_2025_Federal_Signed.pdf',
    extension: '.pdf',
    isSubfolder: false,
    folder: 'C:\\Users\\Engineer\\Downloads\\Taxes',
    fullPath: 'C:\\Users\\Engineer\\Downloads\\Taxes\\Tax_Return_2025_Federal_Signed.pdf',
    lastWriteTimeTicks: 134191000000000000,
    dateCreatedHuman: '2026-04-12 19:04',
    lastModifiedHuman: '2026-04-12 19:04',
    dimensions: 'Filename Catalog Only (No OCR)',
    fileSizeKb: 2310,
    ocrText: '',
    accentColor: '#64748B',
    category: 'PDF',
    isPcCatalogOnly: true,
  },
  {
    id: 'pc-103',
    fileName: 'Motherboard_Z890_Pinout_Diagram.jpg',
    extension: '.jpg',
    isSubfolder: false,
    folder: 'D:\\Hardware_Manuals\\Intel_Z890',
    fullPath: 'D:\\Hardware_Manuals\\Intel_Z890\\Motherboard_Z890_Pinout_Diagram.jpg',
    lastWriteTimeTicks: 134192000000000000,
    dateCreatedHuman: '2026-09-03 15:40',
    lastModifiedHuman: '2026-09-03 15:40',
    dimensions: 'Filename Catalog Only (No OCR)',
    fileSizeKb: 1560,
    ocrText: '',
    accentColor: '#64748B',
    category: 'Image',
    isPcCatalogOnly: true,
  },
  {
    id: 'pc-104',
    fileName: 'Global_Server_Inventory_2026.csv',
    extension: '.csv',
    isSubfolder: false,
    folder: 'C:\\Users\\Engineer\\OneDrive\\Infra',
    fullPath: 'C:\\Users\\Engineer\\OneDrive\\Infra\\Global_Server_Inventory_2026.csv',
    lastWriteTimeTicks: 134193000000000000,
    dateCreatedHuman: '2026-09-11 08:22',
    lastModifiedHuman: '2026-09-11 08:22',
    dimensions: 'Filename Catalog Only (No OCR)',
    fileSizeKb: 195,
    ocrText: '',
    accentColor: '#64748B',
    category: 'CSV',
    isPcCatalogOnly: true,
  },
];
