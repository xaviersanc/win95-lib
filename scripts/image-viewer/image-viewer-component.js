(() => {
    class Win95ImageViewer {
        constructor(rootElement) {
            this.rootElement = rootElement;
            this.viewerRoot = rootElement.querySelector("[data-image-viewer]");
            this.titleElement = rootElement.querySelector("[data-image-viewer-title]");
            this.imageElement = rootElement.querySelector("[data-image-current]");
            this.statusElement = rootElement.querySelector("[data-image-status]");
            this.captionElement = rootElement.querySelector("[data-image-caption]");
            this.emptyElement = rootElement.querySelector("[data-image-empty]");
            this.prevButton = rootElement.querySelector("[data-image-prev]");
            this.nextButton = rootElement.querySelector("[data-image-next]");
            this.images = this.readImages();
            this.currentIndex = 0;

            if (!this.viewerRoot || !this.imageElement || !this.prevButton || !this.nextButton) {
                return;
            }

            this.handlePrev = this.handlePrev.bind(this);
            this.handleNext = this.handleNext.bind(this);

            this.prevButton.addEventListener("click", this.handlePrev);
            this.nextButton.addEventListener("click", this.handleNext);

            this.rootElement.__win95ImageViewerInstance = this;
            this.render();
        }

        // Liste initiale (attribut data-image-list, JSON) ; vide par défaut : les images viennent de Mes documents.
        readImages() {
            const rawImages = this.rootElement.dataset.imageList;
            if (!rawImages) {
                return [];
            }

            try {
                const parsed = JSON.parse(rawImages);
                return Array.isArray(parsed)
                    ? parsed.filter((item) => item && item.src).map((item, index) => ({
                        name: item.name || `Image ${index + 1}`,
                        src: item.src
                    }))
                    : [];
            } catch {
                return [];
            }
        }

        setImages(images, startIndex = 0) {
            if (!Array.isArray(images) || images.length === 0) {
                return;
            }

            this.images = images;
            this.currentIndex = window.Win95Utils.clamp(startIndex, 0, this.images.length - 1);
            this.render();
        }

        handlePrev() {
            if (this.images.length === 0) {
                return;
            }
            this.currentIndex = (this.currentIndex - 1 + this.images.length) % this.images.length;
            this.render();
        }

        handleNext() {
            if (this.images.length === 0) {
                return;
            }
            this.currentIndex = (this.currentIndex + 1) % this.images.length;
            this.render();
        }

        render() {
            const currentImage = this.images[this.currentIndex];
            const hasImage = Boolean(currentImage);
            this.imageElement.hidden = !hasImage;
            if (this.emptyElement) {
                this.emptyElement.hidden = hasImage;
            }
            this.prevButton.disabled = this.images.length < 2;
            this.nextButton.disabled = this.images.length < 2;
            if (!hasImage) {
                this.imageElement.removeAttribute("src");
                if (this.statusElement) {
                    this.statusElement.textContent = "0 / 0";
                }
                if (this.captionElement) {
                    this.captionElement.textContent = "Aucune image";
                }
                if (this.titleElement) {
                    this.titleElement.textContent = "Lecteur d'image";
                }
                return;
            }

            this.imageElement.src = currentImage.src;
            this.imageElement.alt = currentImage.name;

            if (this.statusElement) {
                this.statusElement.textContent = `${this.currentIndex + 1} / ${this.images.length}`;
            }

            if (this.captionElement) {
                this.captionElement.textContent = currentImage.name;
            }

            if (this.titleElement) {
                this.titleElement.textContent = `Lecteur d'image - ${currentImage.name}`;
            }
        }
    }

    function initializeImageViewer() {
        const viewers = document.querySelectorAll("[data-window-app='image-viewer']");
        viewers.forEach((viewer) => {
            new Win95ImageViewer(viewer);
        });
    }

    const imageViewerApi = {
        attach(rootElement) {
            if (rootElement.__win95ImageViewerInstance) {
                return rootElement.__win95ImageViewerInstance;
            }

            return new Win95ImageViewer(rootElement);
        },
        initialize: initializeImageViewer,
        openFromFile(fileDetail) {
            if (!fileDetail || !fileDetail.relativePath) {
                return null;
            }

            const manager = window.Win95WindowManager;
            let windowElement = null;

            if (manager && typeof manager.openApp === "function") {
                windowElement = manager.openApp("image-viewer", { forceNew: true });
            }

            if (!windowElement) {
                windowElement = document.querySelector("[data-window-app='image-viewer']");
            }

            if (!windowElement) {
                return null;
            }

            const instance = windowElement.__win95ImageViewerInstance || imageViewerApi.attach(windowElement);
            const { toSafeUrl } = window.Win95Utils;

            if (Array.isArray(fileDetail.images) && fileDetail.images.length > 0) {
                const images = fileDetail.images.map((image, index) => ({
                    name: image.name || `Image ${index + 1}`,
                    src: toSafeUrl(image.relativePath || image.src || "")
                })).filter((image) => image.src);

                if (images.length > 0) {
                    const startIndex = Number.isInteger(fileDetail.startIndex) ? fileDetail.startIndex : 0;
                    instance.setImages(images, startIndex);
                    return instance;
                }
            }

            const imageName = fileDetail.fileName || fileDetail.relativePath.split("/").pop() || "Image";
            instance.setImages([{ name: imageName, src: toSafeUrl(fileDetail.relativePath) }], 0);

            return instance;
        }
    };

    window.Win95ImageViewer = imageViewerApi;
    window.Win95Services?.register?.("Win95ImageViewer", imageViewerApi);

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeImageViewer);
    } else {
        initializeImageViewer();
    }
})();
