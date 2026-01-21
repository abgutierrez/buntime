import { dlopen, FFIType, CString, ptr } from "bun:ffi";
import { join } from "path";

console.log("CWD:", process.cwd());
const libPath = join(process.cwd(), "libshm.so");
console.log("Loading lib from:", libPath);

// Load the shared library
// We use a try-catch block because on local macOS dev this might fail if not built,
// but inside Docker it will exist.
let lib: any;
try {
  lib = dlopen(libPath, {
    ipc_shm_open: {
      args: [FFIType.ptr, FFIType.u64, FFIType.u64],
      returns: FFIType.i32,
    },
    ipc_shm_unlink: {
      args: [FFIType.ptr, FFIType.u64],
      returns: FFIType.i32,
    },
    ipc_mmap: {
      args: [FFIType.i32, FFIType.u64],
      returns: FFIType.ptr,
    },
    ipc_munmap: {
      args: [FFIType.ptr, FFIType.u64],
      returns: FFIType.i32,
    },
    ipc_close: {
      args: [FFIType.i32],
      returns: FFIType.i32,
    },
  });
} catch (e) {
  console.error("FFI Load Error:", e);
  console.warn("Could not load libshm.so");
}

export function shmOpen(name: string, size: number): number {
  const nameBuffer = Buffer.from(name + "\0");
  return lib.symbols.ipc_shm_open(ptr(nameBuffer), nameBuffer.length, size);
}

export function shmUnlink(name: string): number {
  const nameBuffer = Buffer.from(name + "\0");
  return lib.symbols.ipc_shm_unlink(ptr(nameBuffer), nameBuffer.length);
}

export function mmap(fd: number, size: number): number {
  return lib.symbols.ipc_mmap(fd, size);
}

export function munmap(ptrAddr: number, size: number): number {
  return lib.symbols.ipc_munmap(ptrAddr, size);
}

export function close(fd: number): number {
  return lib.symbols.ipc_close(fd);
}
