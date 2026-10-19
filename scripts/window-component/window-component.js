(() => {
    class DesktopWindowComponent {
        constructor(rootElement) {
            this.rootElement = rootElement;
            this.desktopElement = rootElement.closest(".desktop") || document.body;
            this.dragHandle = rootElement.querySelector("[data-window-drag]");
            this.resizeHandles = {
                top: rootElement.querySelector("[data-window-resize-top]"),
                left: rootElement.querySelector("[data-window-resize-left]"),
                right: rootElement.querySelector("[data-window-resize-right]"),
                bottom: rootElement.querySelector("[data-window-resize-bottom]"),
                bottomLeft: rootElement.querySelector("[data-window-resize-bottom-left]"),
                bottomRight: rootElement.querySelector("[data-window-resize-bottom-right]")
            };

            this.isDragging = false;
            this.resizeState = null;

            this.startPointerX = 0;
            this.startPointerY = 0;
            this.startLeft = 0;
            this.startTop = 0;
            this.startWidth = 0;
            this.startHeight = 0;

            this.onPointerMove = this.onPointerMove.bind(this);
            this.onPointerUp = this.onPointerUp.bind(this);

            this.setup();
        }

        setup() {
            if (this.dragHandle) {
                this.dragHandle.addEventListener("mousedown", (event) => this.startDrag(event));
            }

            this.installResizeHandles();
        }

        installResizeHandles() {
            const handleDefinitions = [
                { key: "top", cursor: "ns-resize" },
                { key: "left", cursor: "ew-resize" },
                { key: "right", cursor: "ew-resize" },
                { key: "bottom", cursor: "ns-resize" },
                { key: "bottomLeft", cursor: "nesw-resize" },
                { key: "bottomRight", cursor: "nwse-resize" }
            ];

            handleDefinitions.forEach(({ key, cursor }) => {
                if (!this.resizeHandles[key]) {
                    this.resizeHandles[key] = this.createResizeHandle(key, cursor);
                }

                this.resizeHandles[key].addEventListener("mousedown", (event) => this.startResize(event, key));
            });
        }

        createResizeHandle(position, cursor) {
            const handle = document.createElement("div");
            handle.dataset.windowResize = position;
            handle.className = `window-resize-handle window-resize-${this.toKebabCase(position)}`;
            handle.style.cursor = cursor;
            this.rootElement.appendChild(handle);
            return handle;
        }

        toKebabCase(value) {
            return String(value || "")
                .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
                .toLowerCase();
        }

        // Le premier plan est géré par le gestionnaire de fenêtres (un seul système de z-index).
        bringToFront() {
            const manager = window.Win95WindowManager;
            if (typeof manager?.showWindow === "function") {
                manager.showWindow(this.rootElement);
                return;
            }

            const windows = Array.from(document.querySelectorAll("[data-window-component]"));
            let maxZIndex = 5;

            windows.forEach((windowElement) => {
                const zIndex = Number.parseInt(windowElement.style.zIndex || "5", 10);
                if (!Number.isNaN(zIndex)) {
                    maxZIndex = Math.max(maxZIndex, zIndex);
                }
            });

            this.rootElement.style.zIndex = String(maxZIndex + 1);
        }

        startDrag(event) {
            if (event.button !== 0) {
                return;
            }

            if (event.target.closest("[data-window-action]")) {
                return;
            }

            this.isDragging = true;
            this.startPointerX = event.clientX;
            this.startPointerY = event.clientY;
            this.startLeft = this.rootElement.offsetLeft;
            this.startTop = this.rootElement.offsetTop;

            this.beginPointerSession(event);
        }

        startResize(event, edge) {
            if (event.button !== 0) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            this.resizeState = edge;
            this.isDragging = false;
            this.startPointerY = event.clientY;
            this.startPointerX = event.clientX;
            this.startLeft = this.rootElement.offsetLeft;
            this.startTop = this.rootElement.offsetTop;
            this.startWidth = this.rootElement.offsetWidth;
            this.startHeight = this.rootElement.offsetHeight;

            this.beginPointerSession(event);
        }

        beginPointerSession(event) {
            this.bringToFront();
            event.preventDefault();

            document.addEventListener("mousemove", this.onPointerMove);
            document.addEventListener("mouseup", this.onPointerUp);
        }

        onPointerMove(event) {
            if (this.isDragging) {
                this.applyDrag(event);
                return;
            }

            if (this.resizeState) {
                this.applyResize(event);
            }
        }

        applyDrag(event) {
            const desktopRect = this.desktopElement.getBoundingClientRect();
            const taskbarElement = document.querySelector(".taskbar");
            const taskbarHeight = taskbarElement ? taskbarElement.offsetHeight : 0;

            const deltaX = event.clientX - this.startPointerX;
            const deltaY = event.clientY - this.startPointerY;

            const maxLeft = desktopRect.width - this.rootElement.offsetWidth;
            const maxTop = desktopRect.height - taskbarHeight - this.rootElement.offsetHeight;

            const nextLeft = this.clamp(this.startLeft + deltaX, 0, Math.max(0, maxLeft));
            const nextTop = this.clamp(this.startTop + deltaY, 0, Math.max(0, maxTop));

            this.rootElement.style.left = `${nextLeft}px`;
            this.rootElement.style.top = `${nextTop}px`;
        }

        applyResize(event) {
            const desktopRect = this.desktopElement.getBoundingClientRect();
            const taskbarElement = document.querySelector(".taskbar");
            const taskbarHeight = taskbarElement ? taskbarElement.offsetHeight : 0;
            const computedStyle = getComputedStyle(this.rootElement);
            const minimumWidth = Number.parseInt(computedStyle.minWidth || "260", 10);
            const minimumHeight = Number.parseInt(computedStyle.minHeight || "180", 10);

            const maxRight = desktopRect.width;
            const maxBottom = desktopRect.height - taskbarHeight;

            const deltaX = event.clientX - this.startPointerX;
            const deltaY = event.clientY - this.startPointerY;

            let nextLeft = this.startLeft;
            let nextTop = this.startTop;
            let nextWidth = this.startWidth;
            let nextHeight = this.startHeight;

            const resizesLeft = this.resizeState === "left" || this.resizeState === "bottomLeft";
            const resizesRight = this.resizeState === "right" || this.resizeState === "bottomRight";
            const resizesTop = this.resizeState === "top";
            const resizesBottom = this.resizeState === "bottom" || this.resizeState === "bottomLeft" || this.resizeState === "bottomRight";

            if (resizesLeft) {
                nextLeft = this.clamp(this.startLeft + deltaX, 0, this.startLeft + this.startWidth - minimumWidth);
                nextWidth = this.startWidth + (this.startLeft - nextLeft);
            }

            if (resizesRight) {
                const maxWidth = Math.max(minimumWidth, maxRight - this.startLeft);
                nextWidth = this.clamp(this.startWidth + deltaX, minimumWidth, maxWidth);
            }

            if (resizesTop) {
                nextTop = this.clamp(this.startTop + deltaY, 0, this.startTop + this.startHeight - minimumHeight);
                nextHeight = this.startHeight + (this.startTop - nextTop);
            }

            if (resizesBottom) {
                const maxHeight = Math.max(minimumHeight, maxBottom - this.startTop);
                nextHeight = this.clamp(this.startHeight + deltaY, minimumHeight, maxHeight);
            }

            nextWidth = this.clamp(nextWidth, minimumWidth, Math.max(minimumWidth, maxRight - nextLeft));
            nextHeight = this.clamp(nextHeight, minimumHeight, Math.max(minimumHeight, maxBottom - nextTop));

            this.rootElement.style.left = `${nextLeft}px`;
            this.rootElement.style.top = `${nextTop}px`;
            this.rootElement.style.width = `${nextWidth}px`;
            this.rootElement.style.height = `${nextHeight}px`;
        }

        onPointerUp() {
            this.isDragging = false;
            this.resizeState = null;

            document.removeEventListener("mousemove", this.onPointerMove);
            document.removeEventListener("mouseup", this.onPointerUp);
        }

        clamp(value, minimum, maximum) {
            return Math.min(maximum, Math.max(minimum, value));
        }
    }

    function initializeWindowComponents() {
        document.querySelectorAll("[data-window-component]").forEach((windowElement) => windowComponentApi.attach(windowElement));
    }

    const windowComponentApi = {
        // Idempotent : attacher deux fois dupliquerait les poignées et les écouteurs de déplacement.
        attach(rootElement) {
            if (!rootElement.__win95WindowComponent) {
                rootElement.__win95WindowComponent = new DesktopWindowComponent(rootElement);
            }
            return rootElement.__win95WindowComponent;
        },
        initialize: initializeWindowComponents
    };

    window.Win95WindowComponent = windowComponentApi;
    window.Win95Services?.register?.("Win95WindowComponent", windowComponentApi);

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeWindowComponents);
    } else {
        initializeWindowComponents();
    }
})();
