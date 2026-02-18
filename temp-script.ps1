Write-Output "before loop"
$matchRows = Import-Csv matches.csv
Write-Output "count $($matchRows.Count)"
for ($i=0; $i -lt 3; $i++) {
  Write-Output "i $i"
}
Write-Output "after loop"
