// IPC Protocol Definitions

export enum MsgType {
  STDOUT = 0x00,
  FS_READ = 0x01,
  FS_WRITE = 0x02,
  LISTDIR = 0x05,
  NET_CONNECT = 0x03,
  EXEC = 0x04,
  CODE = 0x20,
}

export enum ResponseType {
  ALLOW = 0x10,
  DENY = 0x11,
}

export const MSG_HEADER_SIZE = 9;
