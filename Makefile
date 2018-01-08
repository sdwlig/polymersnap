
lint:
	polymer lint --rules=polymer-2 --root . --entrypoint index.html --entrypoint tester.html --entrypoint src/**/*.html --entrypoint test/**/*.html

npminstall:
	npm install --save redux
	npm update polymer-cli

build:
	polymer build

checkoutpolymer:
	cd scripts && ./checkoutpolymer

# http://www.vogella.com/tutorials/GitSubmodules/article.html
polymerpull:
	cd ../polymer && git submodule update --remote -j8
	cd ../polymer && git pull --recurse-submodules -j8

