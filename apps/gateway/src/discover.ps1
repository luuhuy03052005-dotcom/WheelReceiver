$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WheelForeground {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static uint Pid() { uint pid; GetWindowThreadProcessId(GetForegroundWindow(), out pid); return pid; }
}
'@
while ($true) {
  try {
    $items = @(Get-Process | ForEach-Object { @{name=($_.ProcessName + '.exe');pid=$_.Id} })
    @{processes=$items;foregroundPid=[WheelForeground]::Pid()} | ConvertTo-Json -Depth 4 -Compress
  } catch { @{error=$_.Exception.Message} | ConvertTo-Json -Compress }
  Start-Sleep -Seconds 2
}
