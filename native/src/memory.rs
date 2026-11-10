use napi::bindgen_prelude::Buffer;
use napi_derive::napi;
#[link(name = "dwmapi")]

#[cfg(target_os = "windows")]
extern "system" {
    fn GetCurrentProcess() -> isize;
    fn OpenProcess(dw_desired_access: u32, b_inherit_handle: i32, dw_process_id: u32) -> isize;
    fn SetProcessWorkingSetSize(h_process: isize, dw_minimum_working_set_size: usize, dw_maximum_working_set_size: usize) -> i32;
    fn CloseHandle(h_object: isize) -> i32;
    fn DwmSetWindowAttribute(
        hwnd: isize,
        dw_attribute: u32,
        pv_attribute: *const std::ffi::c_void,
        cb_attribute: u32,
    ) -> i32;
}

#[cfg(target_os = "windows")]
#[repr(C)]
#[allow(non_snake_case)]
struct PROCESS_MEMORY_COUNTERS {
    cb: u32,
    PageFaultCount: u32,
    PeakWorkingSetSize: usize,
    WorkingSetSize: usize,
    QuotaPeakPagedPoolUsage: usize,
    QuotaPagedPoolUsage: usize,
    QuotaPeakNonPagedPoolUsage: usize,
    QuotaNonPagedPoolUsage: usize,
    PagefileUsage: usize,
    PeakPagefileUsage: usize,
}

#[cfg(target_os = "windows")]
extern "system" {
    fn K32GetProcessMemoryInfo(
        h_process: isize,
        ppsmc: *mut PROCESS_MEMORY_COUNTERS,
        cb: u32,
    ) -> i32;
}

#[napi]
pub fn trim_memory(pid: Option<u32>) -> bool {
    #[cfg(target_os = "windows")]
    unsafe {
        let handle = match pid {
            Some(p) => OpenProcess(0x0100 | 0x0400, 0, p),
            None => GetCurrentProcess(),
        };
        if handle == 0 {
            return false;
        }
        let res = SetProcessWorkingSetSize(handle, usize::MAX, usize::MAX);
        if pid.is_some() {
            CloseHandle(handle);
        }
        res != 0
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = pid;
        true
    }
}

#[napi]
pub fn rust_optimize_memory_all(pids: Option<Vec<u32>>) -> bool {
    #[cfg(target_os = "windows")]
    unsafe {
        let cur_handle = GetCurrentProcess();
        let _ = SetProcessWorkingSetSize(cur_handle, usize::MAX, usize::MAX);

        if let Some(list) = pids {
            for pid in list {
                let handle = OpenProcess(0x0100 | 0x0400, 0, pid);
                if handle != 0 {
                    let _ = SetProcessWorkingSetSize(handle, usize::MAX, usize::MAX);
                    CloseHandle(handle);
                }
            }
        }
        true
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = pids;
        true
    }
}

#[napi(object)]
pub struct MemoryUsageInfo {
    pub working_set_bytes: i64,
    pub peak_working_set_bytes: i64,
    pub pagefile_bytes: i64,
}

#[napi]
pub fn rust_get_process_memory_info() -> MemoryUsageInfo {
    #[cfg(target_os = "windows")]
    unsafe {
        let mut counters: PROCESS_MEMORY_COUNTERS = std::mem::zeroed();
        counters.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;

        let handle = GetCurrentProcess();
        let ok = K32GetProcessMemoryInfo(handle, &mut counters, counters.cb);
        if ok != 0 {
            return MemoryUsageInfo {
                working_set_bytes: counters.WorkingSetSize as i64,
                peak_working_set_bytes: counters.PeakWorkingSetSize as i64,
                pagefile_bytes: counters.PagefileUsage as i64,
            };
        }
    }

    MemoryUsageInfo {
        working_set_bytes: 0,
        peak_working_set_bytes: 0,
        pagefile_bytes: 0,
    }
}


#[napi]
pub fn rust_disable_window_transitions(hwnd_buffer: Buffer) -> bool {
    #[cfg(target_os = "windows")]
    unsafe {
        let slice = hwnd_buffer.as_ref();
        if slice.len() >= 8 {
            let hwnd = i64::from_ne_bytes(slice[..8].try_into().unwrap()) as isize;
            let disable: u32 = 1;
            let hr = DwmSetWindowAttribute(
                hwnd,
                3,
                &disable as *const _ as *const std::ffi::c_void,
                std::mem::size_of::<u32>() as u32,
            );
            return hr == 0;
        } else if slice.len() >= 4 {
            let hwnd = i32::from_ne_bytes(slice[..4].try_into().unwrap()) as isize;
            let disable: u32 = 1;
            let hr = DwmSetWindowAttribute(
                hwnd,
                3,
                &disable as *const _ as *const std::ffi::c_void,
                std::mem::size_of::<u32>() as u32,
            );
            return hr == 0;
        }
    }
    let _ = hwnd_buffer;
    false
}