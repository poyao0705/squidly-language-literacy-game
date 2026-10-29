import { GridLayout, SvgPlus } from "./squidly-utils";

export function createScreenLayout(className = "") {
	const main = new SvgPlus("main");
	main.className = `game-shell ${className}`.trim();
	// Match AppsFrame's overlay; callers leave cell (0, 0) for Exit.
	const layout = new GridLayout(4, 5);
	layout.classList.add("screen-layout");
	main.append(layout);
	return { main, layout };
}
