# Arreglar TODOS los colores con bajo contraste de una vez

# 1. Reemplazar en HTML
$htmlFiles = Get-ChildItem -Path "donde-comer-cdu" -Filter "*.html" -Recurse

foreach ($file in $htmlFiles) {
    $content = Get-Content $file.FullName -Raw
    
    # Cambiar TODOS los colores específicos oscuros
    $content = $content -replace 'color:rgba\(([0-9,\.]+),0\.[0-7]\)', 'color:rgb(255,255,255)'
    $content = $content -replace 'color:#[0-3][0-9a-f]{5}', 'color:#ffffff'
    
    Set-Content $file.FullName $content
    Write-Host "✓ $($file.Name)"
}

# 2. Reemplazar en CSS
$cssFiles = Get-ChildItem -Path "donde-comer-cdu" -Filter "*.css" -Recurse

foreach ($file in $cssFiles) {
    $content = Get-Content $file.FullName -Raw
    
    $content = $content -replace 'color:rgba\(([0-9,\.]+),0\.[0-7]\)', 'color:rgb(255,255,255)'
    $content = $content -replace 'color:#[0-3][0-9a-f]{5}', 'color:#ffffff'
    $content = $content -replace 'background:rgba\(([0-9,\.]+),0\.[0-7]\)', 'background:rgb(255,255,255)'
    
    Set-Content $file.FullName $content
    Write-Host "✓ $($file.Name)"
}

Write-Host "¡LISTO! Todos los colores oscuros arreglados."
