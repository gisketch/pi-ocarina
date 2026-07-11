// @ts-check
import { cn } from "@/shared/lib/utils";

import archive from "pixelarticons/svg/archive.svg";
import arrowDown from "pixelarticons/svg/arrow-down.svg";
import arrowUp from "pixelarticons/svg/arrow-up.svg";
import attachment from "pixelarticons/svg/attachment.svg";
import check from "pixelarticons/svg/check.svg";
import chevronDown from "pixelarticons/svg/chevron-down.svg";
import chevronRight from "pixelarticons/svg/chevron-right.svg";
import circle from "pixelarticons/svg/circle.svg";
import close from "pixelarticons/svg/close.svg";
import expand from "pixelarticons/svg/expand.svg";
import folder from "pixelarticons/svg/folder.svg";
import folderOpen from "pixelarticons/svg/folder.svg";
import gitBranch from "pixelarticons/svg/git-branch.svg";
import grip from "pixelarticons/svg/menu.svg";
import messagePlus from "pixelarticons/svg/message.svg";
import mic from "pixelarticons/svg/mic.svg";
import monitor from "pixelarticons/svg/monitor.svg";
import moon from "pixelarticons/svg/moon.svg";
import moreHorizontal from "pixelarticons/svg/more-horizontal.svg";
import panelLeft from "pixelarticons/svg/app-windows.svg";
import paperclip from "pixelarticons/svg/attachment.svg";
import pencil from "pixelarticons/svg/pencil.svg";
import pin from "pixelarticons/svg/map-pin.svg";
import plus from "pixelarticons/svg/plus.svg";
import refresh from "pixelarticons/svg/reload.svg";
import rotate from "pixelarticons/svg/repeat.svg";
import send from "pixelarticons/svg/send.svg";
import settings from "pixelarticons/svg/settings-2.svg";
import stop from "pixelarticons/svg/square.svg";
import sun from "pixelarticons/svg/cloud-sun.svg";
import terminal from "pixelarticons/svg/terminal.svg";
import trash from "pixelarticons/svg/trash.svg";
import tree from "pixelarticons/svg/tree.svg";
import fileDiff from "pixelarticons/svg/file.svg";

const icons = { archive, "arrow-down": arrowDown, "arrow-up": arrowUp, attachment, check, "chevron-down": chevronDown, "chevron-right": chevronRight, circle, close, expand, "file-diff": fileDiff, folder, "folder-open": folderOpen, "git-branch": gitBranch, grip, "message-plus": messagePlus, mic, monitor, moon, dots: moreHorizontal, "panel-left": panelLeft, paperclip, pencil, pin, plus, refresh, rotate, send, settings, stop, sun, terminal, trash, tree };

/** @param {React.HTMLAttributes<HTMLSpanElement> & { name: keyof typeof icons, size?: number }} props */
export function Icon({ name, size = 20, className, style, ...props }) {
  const mask = `url("${icons[name]}") center / contain no-repeat`;
  return <span aria-hidden data-slot="icon" className={cn("relative inline-block shrink-0", className)} style={{ width: size, height: size, ...style }} {...props}><span className="absolute inset-0 bg-current" style={{ mask, WebkitMask: mask }} /></span>;
}

/** @param {keyof typeof icons} name */
const named = (name) => function PixelIcon({ size = 16, className = "", ...props }) { return <Icon name={name} size={typeof size === "number" ? size : 16} className={className} {...props} />; };
export const ArchiveIcon = named("archive");
export const ArrowDownIcon = named("arrow-down");
export const ArrowUpIcon = named("arrow-up");
export const CheckIcon = named("check");
export const ChevronRightIcon = named("chevron-right");
export const CircleIcon = named("circle");
export const FileDiffIcon = named("file-diff");
export const FolderGit2Icon = named("git-branch");
export const FolderOpenIcon = named("folder-open");
export const GitBranchIcon = named("git-branch");
export const GripVerticalIcon = named("grip");
export const ListTreeIcon = named("tree");
export const Maximize2Icon = named("expand");
export const MessageSquarePlusIcon = named("message-plus");
export const MonitorIcon = named("monitor");
export const MoonIcon = named("moon");
export const MoreHorizontalIcon = named("dots");
export const PanelLeftIcon = named("panel-left");
export const PaperclipIcon = named("paperclip");
export const PencilIcon = named("pencil");
export const PinIcon = named("pin");
export const PlusIcon = named("plus");
export const RefreshCwIcon = named("refresh");
export const RotateCcwIcon = named("rotate");
export const SendIcon = named("send");
export const SettingsIcon = named("settings");
export const StopCircleIcon = named("stop");
export const SunIcon = named("sun");
export const TerminalIcon = named("terminal");
export const Trash2Icon = named("trash");
export const XIcon = named("close");
