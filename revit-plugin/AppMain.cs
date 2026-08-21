using System;
using System.Reflection;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Autodesk.Revit.UI;

namespace InfraBIMPlugin
{
    public class AppMain : IExternalApplication
    {
        public static DockablePaneId PaneId => new DockablePaneId(new Guid("9A8B7C6D-5E4F-3210-FEDC-BA0987654321"));

        public Result OnStartup(UIControlledApplication application)
        {
            try
            {
                // 1. Crear el manejador de eventos externos para Revit API
                InsertFamilyHandler handler = new InsertFamilyHandler();
                ExternalEvent externalEvent = ExternalEvent.Create(handler);

                // 2. Registrar el panel acoplable (Dockable Pane)
                InfraBIMDockablePane paneControl = new InfraBIMDockablePane(externalEvent, handler);
                application.RegisterDockablePane(PaneId, "InfraBIM Hub", paneControl);

                // 3. Crear la pestaña propia "InfraBIM" en la cinta de opciones (Ribbon) de Revit
                string tabName = "InfraBIM";
                try
                {
                    application.CreateRibbonTab(tabName);
                }
                catch
                {
                    // Si la pestaña ya existía en Revit, continua
                }

                RibbonPanel? ribbonPanel = null;
                try
                {
                    foreach (RibbonPanel panel in application.GetRibbonPanels(tabName))
                    {
                        if (panel.Name == "Herramientas BIM")
                        {
                            ribbonPanel = panel;
                            break;
                        }
                    }
                }
                catch
                {
                }

                if (ribbonPanel == null)
                {
                    ribbonPanel = application.CreateRibbonPanel(tabName, "Herramientas BIM");
                }

                // Botón grande para abrir el panel lateral de InfraBIM Hub
                PushButtonData showPanelBtn = new PushButtonData(
                    "ShowInfraBIMPanel",
                    "InfraBIM\nHub",
                    Assembly.GetExecutingAssembly().Location,
                    typeof(ShowPanelCommand).FullName
                );

                PushButton? pushButton = ribbonPanel.AddItem(showPanelBtn) as PushButton;
                if (pushButton != null)
                {
                    pushButton.ToolTip = "Abre el catálogo interactivo de familias BIM y herramientas de InfraBIM Hub.";
                    pushButton.LongDescription = "Accede a miles de familias BIM clasificadas por categoría y compatibles con tu versión de Revit.";
                    pushButton.LargeImage = CreateRibbonIcon();
                }

                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                TaskDialog.Show("Error de Inicio InfraBIM", ex.Message);
                return Result.Failed;
            }
        }

        private static BitmapSource CreateRibbonIcon()
        {
            const int width = 32;
            const int height = 32;
            PixelFormat format = PixelFormats.Bgra32;
            int stride = width * 4;
            byte[] pixels = new byte[height * stride];

            static double Distance(int x, int y, double cx, double cy)
            {
                double dx = x - cx;
                double dy = y - cy;
                return Math.Sqrt(dx * dx + dy * dy);
            }

            static bool InsideCloud(int x, int y, double offset)
            {
                return
                    Distance(x, y, 10, 18) <= 6 + offset ||
                    Distance(x, y, 16, 14) <= 8 + offset ||
                    Distance(x, y, 23, 18) <= 6 + offset ||
                    (x >= 8 - offset && x <= 25 + offset && y >= 18 - offset && y <= 24 + offset);
            }

            static void SetPixel(byte[] target, int index, byte r, byte g, byte b, byte a)
            {
                target[index] = b;
                target[index + 1] = g;
                target[index + 2] = r;
                target[index + 3] = a;
            }

            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    int index = (y * stride) + (x * 4);
                    bool outer = InsideCloud(x, y, 1.4);
                    bool inner = InsideCloud(x, y, -0.3);
                    bool highlight = inner && (y <= 15 || (x <= 13 && y <= 19));
                    bool baseLine = inner && y >= 23 && x >= 9 && x <= 24;

                    if (baseLine)
                    {
                        SetPixel(pixels, index, 7, 74, 82, 255);
                    }
                    else if (highlight)
                    {
                        SetPixel(pixels, index, 76, 204, 204, 255);
                    }
                    else if (inner)
                    {
                        SetPixel(pixels, index, 14, 107, 111, 255);
                    }
                    else if (outer)
                    {
                        SetPixel(pixels, index, 8, 36, 42, 255);
                    }
                    else
                    {
                        pixels[index + 3] = 0;
                    }
                }
            }

            BitmapSource icon = BitmapSource.Create(width, height, 96, 96, format, null, pixels, stride);
            icon.Freeze();
            return icon;
        }

        public Result OnShutdown(UIControlledApplication application)
        {
            return Result.Succeeded;
        }
    }

    [Autodesk.Revit.Attributes.Transaction(Autodesk.Revit.Attributes.TransactionMode.Manual)]
    public class ShowPanelCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, Autodesk.Revit.DB.ElementSet elements)
        {
            try
            {
                if (commandData?.Application?.Application != null)
                {
                    InfraBIMDockablePane.CurrentRevitVersion = commandData.Application.Application.VersionNumber;
                }

                DockablePane pane = commandData.Application.GetDockablePane(AppMain.PaneId);
                if (pane != null && !pane.IsShown())
                {
                    pane.Show();
                }
                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                message = ex.Message;
                return Result.Failed;
            }
        }
    }
}
