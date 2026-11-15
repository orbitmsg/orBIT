use napi::bindgen_prelude::*;
use std::sync::atomic::{AtomicI32, AtomicU32, Ordering};
use std::sync::Mutex;

#[repr(C)]
struct POINT {
    x: i32,
    y: i32,
}

#[repr(C)]
struct RECT {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

#[repr(C)]
struct MSG {
    hwnd: isize,
    message: u32,
    wparam: usize,
    lparam: isize,
    time: u32,
    pt: POINT,
}

#[repr(C)]
struct WNDCLASSEXW {
    cb_size: u32,
    style: u32,
    lpfn_wnd_proc: Option<unsafe extern "system" fn(isize, u32, usize, isize) -> isize>,
    cb_cls_extra: i32,
    cb_wnd_extra: i32,
    h_instance: isize,
    h_icon: isize,
    h_cursor: isize,
    hbr_background: isize,
    lpsz_menu_name: *const u16,
    lpsz_class_name: *const u16,
    h_icon_sm: isize,
}

#[repr(C)]
struct PAINTSTRUCT {
    hdc: isize,
    f_erase: i32,
    rc_paint: RECT,
    f_restore: i32,
    f_inc_update: i32,
    rgb_reserved: [u8; 32],
}

#[repr(C)]
struct TRACKMOUSEEVENT {
    cb_size: u32,
    dw_flags: u32,
    hwnd_track: isize,
    dw_hover_time: u32,
}

const WS_POPUP: u32 = 0x80000000;
const WS_EX_TOOLWINDOW: u32 = 0x00000080;
const WS_EX_TOPMOST: u32 = 0x00000008;

const WM_DESTROY: u32 = 0x0002;
const WM_PAINT: u32 = 0x000F;
const WM_KILLFOCUS: u32 = 0x0008;
const WM_ACTIVATE: u32 = 0x0006;
const WM_SETCURSOR: u32 = 0x0020;
const WM_NCHITTEST: u32 = 0x0084;
const WM_MOUSEMOVE: u32 = 0x0200;
const WM_LBUTTONDOWN: u32 = 0x0201;
const WM_LBUTTONUP: u32 = 0x0202;
const WM_RBUTTONDOWN: u32 = 0x0204;
const WM_MOUSELEAVE: u32 = 0x02A3;
const WM_KEYDOWN: u32 = 0x0100;

const VK_ESCAPE: usize = 0x1B;
const TME_LEAVE: u32 = 0x00000002;
const HTCLIENT: isize = 1;

const SW_SHOW: i32 = 5;
const SM_CXSCREEN: i32 = 0;
const SM_CYSCREEN: i32 = 1;
const COLOR_WINDOW: isize = 5;
const IDC_ARROW: usize = 32512;

const DT_LEFT: u32 = 0x00000000;
const DT_VCENTER: u32 = 0x00000004;
const DT_SINGLELINE: u32 = 0x00000020;
const DT_NOPREFIX: u32 = 0x00000800;
const DT_CALCRECT: u32 = 0x00000400;

#[link(name = "user32")]
extern "system" {
    fn RegisterClassExW(lpwcx: *const WNDCLASSEXW) -> u16;
    fn CreateWindowExW(
        dwExStyle: u32,
        lpClassName: *const u16,
        lpWindowName: *const u16,
        dwStyle: u32,
        X: i32,
        Y: i32,
        nWidth: i32,
        nHeight: i32,
        hWndParent: isize,
        hMenu: isize,
        hInstance: isize,
        lpParam: *mut std::ffi::c_void,
    ) -> isize;
    fn DefWindowProcW(hWnd: isize, Msg: u32, wParam: usize, lParam: isize) -> isize;
    fn ShowWindow(hWnd: isize, nCmdShow: i32) -> i32;
    fn SetForegroundWindow(hWnd: isize) -> i32;
    fn SetFocus(hWnd: isize) -> isize;
    fn GetClientRect(hWnd: isize, lpRect: *mut RECT) -> i32;
    fn BeginPaint(hWnd: isize, lpPaint: *mut PAINTSTRUCT) -> isize;
    fn EndPaint(hWnd: isize, lpPaint: *const PAINTSTRUCT) -> i32;
    fn InvalidateRect(hWnd: isize, lpRect: *const RECT, bErase: i32) -> i32;
    fn TrackMouseEvent(lpEventTrack: *mut TRACKMOUSEEVENT) -> i32;
    fn GetSystemMetrics(nIndex: i32) -> i32;
    fn DestroyWindow(hWnd: isize) -> i32;
    fn PostQuitMessage(nExitCode: i32);
    fn GetMessageW(lpMsg: *mut MSG, hWnd: isize, wMsgFilterMin: u32, wMsgFilterMax: u32) -> i32;
    fn TranslateMessage(lpMsg: *const MSG) -> i32;
    fn DispatchMessageW(lpMsg: *const MSG) -> isize;
    fn LoadCursorW(hInstance: isize, lpCursorName: *const u16) -> isize;
    fn SetCursor(hCursor: isize) -> isize;
    fn SetCapture(hWnd: isize) -> isize;
    fn ReleaseCapture() -> i32;
    fn SetWindowRgn(hWnd: isize, hRgn: isize, bRedraw: i32) -> i32;
    fn GetCursorPos(lpPoint: *mut POINT) -> i32;
    fn SendMessageW(hWnd: isize, Msg: u32, wParam: usize, lParam: isize) -> isize;
    fn LoadImageW(
        hInst: isize,
        name: *const u16,
        type_: u32,
        cx: i32,
        cy: i32,
        fuLoad: u32,
    ) -> isize;
    fn SetClassLongPtrW(hWnd: isize, nIndex: i32, dwNewLong: isize) -> isize;
}

#[link(name = "shell32")]
extern "system" {
    fn SHChangeNotify(wEventId: i32, uFlags: u32, dwItem1: *const std::ffi::c_void, dwItem2: *const std::ffi::c_void);
}

#[link(name = "gdi32")]
extern "system" {
    fn CreateSolidBrush(color: u32) -> isize;
    fn CreateCompatibleDC(hdc: isize) -> isize;
    fn CreateCompatibleBitmap(hdc: isize, cx: i32, cy: i32) -> isize;
    fn SelectObject(hdc: isize, h: isize) -> isize;
    fn DeleteObject(ho: isize) -> i32;
    fn DeleteDC(hdc: isize) -> i32;
    fn BitBlt(hdcDest: isize, nXDest: i32, nYDest: i32, nWidth: i32, nHeight: i32, hdcSrc: isize, nXSrc: i32, nYSrc: i32, dwRop: u32) -> i32;
    fn FillRect(hDC: isize, lprc: *const RECT, hbr: isize) -> i32;
    fn SetBkMode(hdc: isize, mode: i32) -> i32;
    fn SetTextColor(hdc: isize, color: u32) -> u32;
    fn CreateFontW(
        cHeight: i32,
        cWidth: i32,
        cEscapement: i32,
        cOrientation: i32,
        cWeight: i32,
        bItalic: u32,
        bUnderline: u32,
        bStrikeOut: u32,
        iCharSet: u32,
        iOutPrecision: u32,
        iClipPrecision: u32,
        iQuality: u32,
        iPitchAndFamily: u32,
        pszFaceName: *const u16,
    ) -> isize;
    fn DrawTextW(hdc: isize, lpchText: *const u16, cchText: i32, lprc: *mut RECT, format: u32) -> i32;
    fn CreateRoundRectRgn(x1: i32, y1: i32, x2: i32, y2: i32, w: i32, h: i32) -> isize;
}

static HOVER_INDEX: AtomicI32 = AtomicI32::new(-1);
static SELECTED_INDEX: AtomicI32 = AtomicI32::new(-1);
static MENU_ITEMS: Mutex<Vec<Vec<u16>>> = Mutex::new(Vec::new());
static MENU_FONT_NAME: Mutex<Vec<u16>> = Mutex::new(Vec::new());

static COLOR_BG: AtomicU32 = AtomicU32::new(0x00121212);
static COLOR_TEXT: AtomicU32 = AtomicU32::new(0x00ffffff);
static COLOR_HOVER: AtomicU32 = AtomicU32::new(0x00211e1e);

const FONT_SIZE: i32 = -12;
const ITEM_HEIGHT: i32 = 30;
const PADDING_V: i32 = 5;
const PADDING_H: i32 = 14;

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

unsafe extern "system" fn tray_menu_wnd_proc(
    hwnd: isize,
    msg: u32,
    wparam: usize,
    lparam: isize,
) -> isize {
    match msg {
        WM_NCHITTEST => HTCLIENT,
        WM_SETCURSOR => {
            let h_cursor = LoadCursorW(0, IDC_ARROW as *const u16);
            SetCursor(h_cursor);
            1
        }
        WM_PAINT => {
            let mut ps = std::mem::zeroed::<PAINTSTRUCT>();
            let hdc = BeginPaint(hwnd, &mut ps);

            let mut rc = std::mem::zeroed::<RECT>();
            GetClientRect(hwnd, &mut rc);
            let w = rc.right - rc.left;
            let h = rc.bottom - rc.top;

            let mem_dc = CreateCompatibleDC(hdc);
            let mem_bm = CreateCompatibleBitmap(hdc, w, h);
            let old_bm = SelectObject(mem_dc, mem_bm);

            let bg_val = COLOR_BG.load(Ordering::SeqCst);
            let text_val = COLOR_TEXT.load(Ordering::SeqCst);
            let hover_val = COLOR_HOVER.load(Ordering::SeqCst);

            let bg_brush = CreateSolidBrush(bg_val);
            FillRect(mem_dc, &rc, bg_brush);
            DeleteObject(bg_brush);

            SetBkMode(mem_dc, 1);
            let font_name = {
                let global_font = MENU_FONT_NAME.lock().unwrap();
                if global_font.is_empty() {
                    to_wide("Segoe UI")
                } else {
                    global_font.clone()
                }
            };
            let hfont = CreateFontW(
                FONT_SIZE, 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 5, 0, font_name.as_ptr(),
            );
            let old_font = SelectObject(mem_dc, hfont);

            let current_hover = HOVER_INDEX.load(Ordering::SeqCst);
            let items = MENU_ITEMS.lock().unwrap();

            for (i, item) in items.iter().enumerate() {
                let item_top = PADDING_V + (i as i32) * ITEM_HEIGHT;
                let item_bottom = item_top + ITEM_HEIGHT;

                if i as i32 == current_hover {
                    let hover_rc = RECT {
                        left: 0,
                        top: item_top,
                        right: w,
                        bottom: item_bottom,
                    };
                    let hover_brush = CreateSolidBrush(hover_val);
                    FillRect(mem_dc, &hover_rc, hover_brush);
                    DeleteObject(hover_brush);
                }

                let mut text_rc = RECT {
                    left: PADDING_H,
                    top: item_top,
                    right: w - PADDING_H,
                    bottom: item_bottom,
                };

                SetTextColor(mem_dc, text_val);
                DrawTextW(
                    mem_dc,
                    item.as_ptr(),
                    -1,
                    &mut text_rc,
                    DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX,
                );
            }

            SelectObject(mem_dc, old_font);
            DeleteObject(hfont);

            BitBlt(hdc, 0, 0, w, h, mem_dc, 0, 0, 0x00CC0020);
            SelectObject(mem_dc, old_bm);
            DeleteObject(mem_bm);
            DeleteDC(mem_dc);

            EndPaint(hwnd, &ps);
            0
        }
        WM_MOUSEMOVE => {
            let h_cursor = LoadCursorW(0, IDC_ARROW as *const u16);
            SetCursor(h_cursor);

            let x = (lparam & 0xFFFF) as i16 as i32;
            let y = ((lparam >> 16) & 0xFFFF) as i16 as i32;

            let mut rc = std::mem::zeroed::<RECT>();
            GetClientRect(hwnd, &mut rc);

            let items_len = {
                let items = MENU_ITEMS.lock().unwrap();
                items.len() as i32
            };

            let mut new_hover = -1;
            if x >= 0 && x < rc.right && y >= PADDING_V && y < PADDING_V + items_len * ITEM_HEIGHT {
                new_hover = (y - PADDING_V) / ITEM_HEIGHT;
                if new_hover >= items_len {
                    new_hover = -1;
                }
            }

            let old_hover = HOVER_INDEX.swap(new_hover, Ordering::SeqCst);
            if old_hover != new_hover {
                InvalidateRect(hwnd, std::ptr::null(), 0);
            }

            let mut tme = TRACKMOUSEEVENT {
                cb_size: std::mem::size_of::<TRACKMOUSEEVENT>() as u32,
                dw_flags: TME_LEAVE,
                hwnd_track: hwnd,
                dw_hover_time: 0,
            };
            TrackMouseEvent(&mut tme);
            0
        }
        WM_MOUSELEAVE => {
            HOVER_INDEX.store(-1, Ordering::SeqCst);
            InvalidateRect(hwnd, std::ptr::null(), 0);
            0
        }
        WM_LBUTTONDOWN => {
            let x = (lparam & 0xFFFF) as i16 as i32;
            let y = ((lparam >> 16) & 0xFFFF) as i16 as i32;
            let mut rc = std::mem::zeroed::<RECT>();
            GetClientRect(hwnd, &mut rc);

            if x < 0 || x >= rc.right || y < 0 || y >= rc.bottom {
                SELECTED_INDEX.store(-1, Ordering::SeqCst);
                DestroyWindow(hwnd);
            }
            0
        }
        WM_LBUTTONUP => {
            let x = (lparam & 0xFFFF) as i16 as i32;
            let y = ((lparam >> 16) & 0xFFFF) as i16 as i32;
            let mut rc = std::mem::zeroed::<RECT>();
            GetClientRect(hwnd, &mut rc);

            let items_len = {
                let items = MENU_ITEMS.lock().unwrap();
                items.len() as i32
            };

            if x >= 0 && x < rc.right && y >= PADDING_V && y < PADDING_V + items_len * ITEM_HEIGHT {
                let idx = (y - PADDING_V) / ITEM_HEIGHT;
                if idx >= 0 && idx < items_len {
                    SELECTED_INDEX.store(idx, Ordering::SeqCst);
                }
            }
            DestroyWindow(hwnd);
            0
        }
        WM_RBUTTONDOWN | WM_KILLFOCUS => {
            DestroyWindow(hwnd);
            0
        }
        WM_ACTIVATE => {
            if (wparam & 0xFFFF) == 0 {
                DestroyWindow(hwnd);
            }
            0
        }
        WM_KEYDOWN => {
            if wparam == VK_ESCAPE {
                SELECTED_INDEX.store(-1, Ordering::SeqCst);
                DestroyWindow(hwnd);
            }
            0
        }
        WM_DESTROY => {
            PostQuitMessage(0);
            0
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

#[napi]
pub fn show_native_tray_menu(
    tray_x: i32,
    tray_y: i32,
    _tray_w: i32,
    tray_h: i32,
    items: Vec<String>,
    bg_color: Option<u32>,
    text_color: Option<u32>,
    hover_color: Option<u32>,
    _border_color: Option<u32>,
    font_name: Option<String>,
) -> Result<i32> {
    if items.is_empty() {
        return Ok(-1);
    }

    let bg = bg_color.unwrap_or(0x00121212);
    let text = text_color.unwrap_or(0x00ffffff);
    let hover = hover_color.unwrap_or(0x00211e1e);

    COLOR_BG.store(bg, Ordering::SeqCst);
    COLOR_TEXT.store(text, Ordering::SeqCst);
    COLOR_HOVER.store(hover, Ordering::SeqCst);

    let fname = font_name.unwrap_or_else(|| "Segoe UI".to_string());
    let wide_fname = to_wide(&fname);
    {
        let mut global_font = MENU_FONT_NAME.lock().unwrap();
        *global_font = wide_fname.clone();
    }

    let wide_items: Vec<Vec<u16>> = items.iter().map(|s| to_wide(s)).collect();
    let items_count = wide_items.len() as i32;

    {
        let mut global_items = MENU_ITEMS.lock().unwrap();
        *global_items = wide_items.clone();
    }

    HOVER_INDEX.store(-1, Ordering::SeqCst);
    SELECTED_INDEX.store(-1, Ordering::SeqCst);

    let class_name = to_wide("OrbitaNativeTrayMenuClass_v3");
    let window_name = to_wide("OrbitaTrayMenu");

    unsafe {
        let h_cursor = LoadCursorW(0, IDC_ARROW as *const u16);
        let mut wc = std::mem::zeroed::<WNDCLASSEXW>();
        wc.cb_size = std::mem::size_of::<WNDCLASSEXW>() as u32;
        wc.lpfn_wnd_proc = Some(tray_menu_wnd_proc);
        wc.lpsz_class_name = class_name.as_ptr();
        wc.h_cursor = h_cursor;
        wc.hbr_background = COLOR_WINDOW;
        RegisterClassExW(&wc);

        let mut max_text_width = 0;
        let calc_dc = CreateCompatibleDC(0);
        if calc_dc != 0 {
            let font_for_calc = CreateFontW(
                FONT_SIZE, 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 5, 0, wide_fname.as_ptr(),
            );
            let old_calc_font = SelectObject(calc_dc, font_for_calc);
            for item in &wide_items {
                let mut calc_rc = RECT { left: 0, top: 0, right: 0, bottom: 0 };
                DrawTextW(calc_dc, item.as_ptr(), -1, &mut calc_rc, DT_CALCRECT | DT_NOPREFIX | DT_SINGLELINE);
                let w = calc_rc.right - calc_rc.left;
                if w > max_text_width {
                    max_text_width = w;
                }
            }
            SelectObject(calc_dc, old_calc_font);
            DeleteObject(font_for_calc);
            DeleteDC(calc_dc);
        }

        let total_height = PADDING_V * 2 + items_count * ITEM_HEIGHT;
        let total_width = (max_text_width + PADDING_H * 2 + 20).max(180);

        let screen_w = GetSystemMetrics(SM_CXSCREEN);
        let screen_h = GetSystemMetrics(SM_CYSCREEN);

        let mut cursor_pt = POINT { x: 0, y: 0 };
        GetCursorPos(&mut cursor_pt);
        if cursor_pt.x == 0 && cursor_pt.y == 0 {
            cursor_pt.x = tray_x;
            cursor_pt.y = tray_y;
        }

        let mut menu_x = cursor_pt.x;
        let mut menu_y = cursor_pt.y - total_height;

        if menu_x + total_width > screen_w - 4 {
            menu_x = cursor_pt.x - total_width;
        }
        if menu_x + total_width > screen_w - 4 {
            menu_x = screen_w - total_width - 4;
        }
        if menu_x < 4 {
            menu_x = 4;
        }

        if menu_y < 4 {
            menu_y = cursor_pt.y + tray_h.max(16);
        }
        if menu_y + total_height > screen_h - 4 {
            menu_y = screen_h - total_height - 4;
        }

        let hwnd = CreateWindowExW(
            WS_EX_TOOLWINDOW | WS_EX_TOPMOST,
            class_name.as_ptr(),
            window_name.as_ptr(),
            WS_POPUP,
            menu_x,
            menu_y,
            total_width,
            total_height,
            0,
            0,
            0,
            std::ptr::null_mut(),
        );

        if hwnd == 0 {
            return Ok(-1);
        }

        let rgn = CreateRoundRectRgn(0, 0, total_width + 1, total_height + 1, 16, 16);
        SetWindowRgn(hwnd, rgn, 1);

        SetCursor(h_cursor);
        ShowWindow(hwnd, SW_SHOW);
        SetForegroundWindow(hwnd);
        SetFocus(hwnd);
        SetCapture(hwnd);

        let mut msg = std::mem::zeroed::<MSG>();
        while GetMessageW(&mut msg, 0, 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        ReleaseCapture();
    }

    Ok(SELECTED_INDEX.load(Ordering::SeqCst))
}

#[napi]
pub fn rust_set_window_icon(hwnd_buf: Buffer, ico_path: String) -> bool {
    #[cfg(target_os = "windows")]
    {
        if hwnd_buf.len() < 8 {
            return false;
        }
        let hwnd_val = isize::from_ne_bytes(hwnd_buf.as_ref()[..8].try_into().unwrap_or([0; 8]));
        if hwnd_val == 0 {
            return false;
        }

        let wide_path = to_wide(&ico_path);
        const IMAGE_ICON: u32 = 1;
        const LR_LOADFROMFILE: u32 = 0x00000010;
        const LR_DEFAULTSIZE: u32 = 0x00000040;

        unsafe {
            let hicon_big = LoadImageW(0, wide_path.as_ptr(), IMAGE_ICON, 32, 32, LR_LOADFROMFILE);
            let hicon_small = LoadImageW(0, wide_path.as_ptr(), IMAGE_ICON, 16, 16, LR_LOADFROMFILE);
            let hicon_def = LoadImageW(0, wide_path.as_ptr(), IMAGE_ICON, 0, 0, LR_LOADFROMFILE | LR_DEFAULTSIZE);

            let primary_big = if hicon_big != 0 { hicon_big } else { hicon_def };
            let primary_small = if hicon_small != 0 { hicon_small } else { hicon_def };

            if primary_big != 0 {
                const WM_SETICON: u32 = 0x0080;
                const ICON_SMALL: usize = 0;
                const ICON_BIG: usize = 1;
                const ICON_SMALL2: usize = 2;

                SendMessageW(hwnd_val, WM_SETICON, ICON_BIG, primary_big);
                SendMessageW(hwnd_val, WM_SETICON, ICON_SMALL, primary_small);
                SendMessageW(hwnd_val, WM_SETICON, ICON_SMALL2, primary_small);

                const GCLP_HICON: i32 = -14;
                const GCLP_HICONSM: i32 = -34;
                SetClassLongPtrW(hwnd_val, GCLP_HICON, primary_big);
                SetClassLongPtrW(hwnd_val, GCLP_HICONSM, primary_small);

                SHChangeNotify(0x08000000, 0, std::ptr::null(), std::ptr::null());
                return true;
            }
        }
    }
    false
}
