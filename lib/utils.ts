import {clsx, type ClassValue} from "clsx"
import {twMerge} from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function getTodayDate(date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

export function formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) {
        throw new RangeError("bytes must be a non-negative finite number");
    }

    const kilobyte = 1024;
    const megabyte = kilobyte * 1024;
    const unit = bytes >= megabyte ? "MB" : "KB";
    const value = bytes / (unit === "MB" ? megabyte : kilobyte);
    const formattedValue = new Intl.NumberFormat("ko-KR", {
        maximumFractionDigits: 2,
    }).format(value);

    return `${formattedValue} ${unit}`;
}
