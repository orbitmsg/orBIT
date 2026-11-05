use napi_derive::napi;

#[cfg(target_os = "windows")]
extern "system" {
    fn GetCurrentProcess() -> isize;
    fn OpenProcess(dw_desired_access: u32, b_inherit_handle: i32, dw_process_id: u32) -> isize;
    fn SetProcessWorkingSetSize(h_process: isize, dw_minimum_working_set_size: usize, dw_maximum_working_set_size: usize) -> i32;
    fn CloseHandle(h_object: isize) -> i32;
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
