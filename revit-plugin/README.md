# InfraBIM Plugin para Autodesk Revit

Plugin oficial en **C# .NET** para integrar la plataforma **InfraBIM Hub** directamente dentro de Autodesk Revit (versiones 2023, 2024, 2025 y 2026).

---

## 🛠️ Requisitos Previos

- **Autodesk Revit** (2023 - 2026).
- **.NET SDK 8.0** o **Visual Studio 2022** con la carga de trabajo de *Desarrollo de escritorio con .NET*.

---

## 📦 Estructura del Código Fuente

```text
d:\Project\InfraBIM\revit-plugin\
├── InfraBIMPlugin.csproj       # Proyecto .NET SDK C#
├── InfraBIMPlugin.addin        # Manifiesto de registro para Revit
├── AppMain.cs                  # Aplicación de Ribbon y registro del Dockable Pane
├── InsertFamilyHandler.cs      # Manejador de descarga e inserción interactiva (.rfa)
├── InfraBIMDockablePane.xaml   # Panel lateral WPF con control WebView2
└── InfraBIMDockablePane.xaml.cs # Puente JS ↔ C# (window.chrome.webview.postMessage)
```

---

## 🚀 Compilación e Instalación Paso a Paso

### Paso 1: Compilar la solución

Abre la terminal en la carpeta `revit-plugin` y ejecuta:

```bash
cd d:\Project\InfraBIM\revit-plugin
dotnet build -c Release
```

Esto generará el ensamblado `InfraBIMPlugin.dll`.

### Paso 2: Copiar el manifiesto a la carpeta Addins de Revit

Copia el archivo `InfraBIMPlugin.addin` y el binario `InfraBIMPlugin.dll` a la ruta oficial de Addins de tu versión de Revit:

- **Para Revit 2026:**
  `C:\Users\<TuUsuario>\AppData\Roaming\Autodesk\Revit\Addins\2026\`

- **Para Revit 2025:**
  `C:\Users\<TuUsuario>\AppData\Roaming\Autodesk\Revit\Addins\2025\`

### Paso 3: Abrir Autodesk Revit

1. Inicia Autodesk Revit.
2. Verás la nueva pestaña **"InfraBIM"** en la cinta de opciones superior.
3. Haz clic en **"Abrir InfraBIM Hub"** para mostrar el panel lateral acoplable.
4. Al hacer clic en **"Cargar en Revit"** o **"Descargar"** desde la web en el panel, la familia se descargará e insertará interactivamente en tu modelo de Revit activo.
