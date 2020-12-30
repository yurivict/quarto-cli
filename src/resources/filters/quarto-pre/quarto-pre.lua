-- quarto-pre.lua
-- Copyright (C) 2020 by RStudio, PBC

-- required version
PANDOC_VERSION:must_be_at_least '2.11.2'

-- required modules
text = require 'text'

-- [import]
function import(script)
  local sep = package.config:sub(1,1)
  script = string.gsub(script, "/", sep)
  local path = PANDOC_SCRIPT_FILE:match("(.*" .. sep .. ")")
  dofile(path .. script)
end
import("outputs.lua")
import("latexdiv.lua")
import("figures.lua")
import("../common/params.lua")
import("../common/meta.lua")
import("../common/table.lua")
import("../common/pandoc.lua")
import("../common/layout.lua")
import("../common/refs.lua")
import("../common/figures.lua")
import("../common/debug.lua")
-- [/import]


return {
  initParams(),
  combineFilters({
    outputs(),
    latexDiv(),
    figures()
  })
}



