Add-Type @"
using System;
using System.Runtime.InteropServices;

[ComImport]
[Guid("56fdf344-fd6d-11d0-958a-006097c9a090")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface ITaskbarList {
    void HrInit();
    void AddTab(IntPtr hwnd);
    void DeleteTab(IntPtr hwnd);
    void ActivateTab(IntPtr hwnd);
    void SetActiveAlt(IntPtr hwnd);
}

[ComImport]
[Guid("56fdf342-fd6d-11d0-958a-006097c9a090")]
public class TaskbarList { }

public class Taskbar {
    private static ITaskbarList _tbl;
    private static ITaskbarList Tbl {
        get {
            if (_tbl == null) {
                _tbl = (ITaskbarList)new TaskbarList();
                _tbl.HrInit();
            }
            return _tbl;
        }
    }
    public static void Show(IntPtr hwnd) {
        try { Tbl.AddTab(hwnd); } catch {}
    }
    public static void Hide(IntPtr hwnd) {
        try { Tbl.DeleteTab(hwnd); } catch {}
    }
}

public class Win32 {
    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X; public int Y; }
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    
    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT lpPoint);
    [DllImport("user32.dll")]
    public static extern IntPtr WindowFromPoint(POINT Point);
    [DllImport("user32.dll")]
    public static extern IntPtr GetAncestor(IntPtr hwnd, uint gaFlags);
    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll")]
    public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")]
    public static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongW")]
    public static extern IntPtr SetWindowLong32(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    public static IntPtr SetWindowOwner(IntPtr hWnd, IntPtr hOwner) {
        if (IntPtr.Size == 8) {
            return SetWindowLongPtr64(hWnd, -8, hOwner); // -8 is GWL_HWNDPARENT
        } else {
            return SetWindowLong32(hWnd, -8, hOwner);
        }
    }
}
"@

# Read bounds, pid, and owner HWND from arguments
$x = [int]$args[0]
$y = [int]$args[1]
$w = [int]$args[2]
$h = [int]$args[3]
$ourPid = [int]$args[4]
$ownerHwndVal = $args[5]

Write-Output "Started monitoring for bounds: $x, $y, $w, $h (Our PID: $ourPid, Owner HWND: $ownerHwndVal)"

$wasDown = $false
$draggedHwnd = [IntPtr]::Zero
$initialLeft = 0
$initialTop = 0

while ($true) {
    $state = [Win32]::GetAsyncKeyState(0x01)
    $isDown = (($state -band 0x8000) -ne 0)

    if ($isDown) {
        if (-not $wasDown) {
            $wasDown = $true
            # Mouse just went down! Record the window under the cursor and its starting position
            $pt = New-Object Win32+POINT
            if ([Win32]::GetCursorPos([ref]$pt)) {
                $hwnd = [Win32]::WindowFromPoint($pt)
                if ($hwnd -ne [IntPtr]::Zero) {
                    $rootHwnd = [Win32]::GetAncestor($hwnd, 2) # GA_ROOT = 2
                    if ($rootHwnd -ne [IntPtr]::Zero) {
                        $procId = 0
                        [Win32]::GetWindowThreadProcessId($rootHwnd, [ref]$procId)
                        if ($procId -ne $ourPid) {
                            $draggedHwnd = $rootHwnd
                            $rect = New-Object Win32+RECT
                            if ([Win32]::GetWindowRect($draggedHwnd, [ref]$rect)) {
                                $initialLeft = $rect.Left
                                $initialTop = $rect.Top
                            }
                        } else {
                            $draggedHwnd = [IntPtr]::Zero
                        }
                    }
                }
            }
        }
    } elseif ($wasDown) {
        $wasDown = $false
        
        # Mouse was released! Check if we were dragging a valid external window
        if ($draggedHwnd -ne [IntPtr]::Zero) {
            $pt = New-Object Win32+POINT
            if ([Win32]::GetCursorPos([ref]$pt)) {
                # Is the release cursor inside our dashed box area?
                if ($pt.X -ge $x -and $pt.X -le ($x + $w) -and $pt.Y -ge $y -and $pt.Y -le ($y + $h)) {
                    # Wait 150ms for OS to finish drag-drop window placement
                    Start-Sleep -Milliseconds 150
                    
                    # Verify the window actually moved (was dragged)
                    $rect = New-Object Win32+RECT
                    if ([Win32]::GetWindowRect($draggedHwnd, [ref]$rect)) {
                        # If its top-left position has changed, it was dragged!
                        if ($rect.Left -ne $initialLeft -or $rect.Top -ne $initialTop) {
                            # Set window owner to keep it always on top
                            if ($ownerHwndVal -and $ownerHwndVal -ne "0") {
                                try {
                                    [Win32]::SetWindowOwner($draggedHwnd, [IntPtr][int64]$ownerHwndVal)
                                } catch {
                                    Write-Output "SetWindowOwner Error: $_"
                                }
                            }
                            
                            # Hide from taskbar
                            [Taskbar]::Hide($draggedHwnd)
                            
                            # Dock the window!
                            [Win32]::MoveWindow($draggedHwnd, $x, $y, $w, $h, $true)
                            Write-Output "DOCKED: $draggedHwnd"
                            break
                        }
                    }
                }
            }
        }
        $draggedHwnd = [IntPtr]::Zero
    }
    Start-Sleep -Milliseconds 100
}
