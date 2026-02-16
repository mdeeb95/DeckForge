.PHONY: dev build flatpak backend deploy check clean

dev:
	npm run tauri dev

build:
	npm run tauri build

flatpak:
	flatpak-builder --force-clean build-dir com.deckforge.app.yml

backend:
	cd backend && uvicorn app.main:app --reload

deploy:
	./scripts/deploy-backend.sh

check:
	npm run check

clean:
	rm -rf dist build-dir
	cd src-tauri && cargo clean
