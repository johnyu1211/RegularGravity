Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
}
"@

# Read coordinates from stdin in a loop to avoid startup overhead
while ($line = [Console]::ReadLine()) {
    if ([string]::IsNullOrEmpty($line) -or $line -eq "exit") {
        break
    }
    
    $parts = $line.Split(",")
    if ($parts.Length -eq 5) {
        try {
            $hwnd = [IntPtr][int64]$parts[0]
            $x = [int]$parts[1]
            $y = [int]$parts[2]
            $w = [int]$parts[3]
            $h = [int]$parts[4]
            
            [Win32]::MoveWindow($hwnd, $x, $y, $w, $h, $true)
        } catch {
            # Silently handle parsing/docking errors to keep loop running
        }
    }
}
