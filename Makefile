.PHONY: dev build deck deploy-deck flatpak backend deploy check clean

dev:
	npm run tauri dev

build:
	npm run tauri build

deck:
	./scripts/build-deck.sh

deploy-deck:
	./scripts/deploy-deck.sh

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
