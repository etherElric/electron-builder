import { lcid } from "builder-util/out/langs"
import { getLicenseFiles, getLicenseButtonFiles, getLicenseButtons } from "builder-util/out/license"
import * as path from "path"
import { WinPackager } from "../../winPackager"
import { NsisOptions } from "./nsisOptions"
import { NsisScriptGenerator } from "./nsisScriptGenerator"
import { nsisTemplatesDir } from "./nsisUtil"

export async function computeLicensePage(packager: WinPackager, options: NsisOptions, scriptGenerator: NsisScriptGenerator, languages: Array<string>): Promise<void> {
  const possibleFiles: Array<string> = []
  for (const name of ["license", "eula"]) {
    for (const ext of ["rtf", "txt", "html"]) {
      possibleFiles.push(`${name}.${ext}`)
      possibleFiles.push(`${name.toUpperCase()}.${ext}`)
      possibleFiles.push(`${name}.${ext.toUpperCase()}`)
      possibleFiles.push(`${name.toUpperCase()}.${ext.toUpperCase()}`)
    }
  }

  const license = await packager.getResource(options.license, ...possibleFiles)

  if (license != null) {
    let licensePage: Array<string>
    if (license.endsWith(".html")) {
      licensePage = [
        "!define MUI_PAGE_CUSTOMFUNCTION_SHOW LicenseShow",
        "Function LicenseShow",
        "  FindWindow $R0 `#32770` `` $HWNDPARENT",
        "  GetDlgItem $R0 $R0 1000",
        "EmbedHTML::Load /replace $R0 file://$PLUGINSDIR\\license.html",
        "FunctionEnd",

        `!insertmacro MUI_PAGE_LICENSE "${path.join(nsisTemplatesDir, "empty-license.txt")}"`,
      ]
    }
    else {
      licensePage = [`!insertmacro MUI_PAGE_LICENSE "${license}"`]
    }

    scriptGenerator.macro("licensePage", licensePage)
    if (license.endsWith(".html")) {
      scriptGenerator.macro("addLicenseFiles", [`File /oname=$PLUGINSDIR\\license.html "${license}"`])
    }
    return
  }

  const licenseFiles = await getLicenseFiles(packager)
  if (licenseFiles.length === 0) {
    return
  }

  const licensePage: Array<string> = []
  const unspecifiedLangs = new Set(languages)

  const langOrder: Array<string> = []

  let defaultFile: string | null = null
  for (const item of licenseFiles) {
    langOrder.push(item.langWithRegion)
    unspecifiedLangs.delete(item.langWithRegion)
    if (defaultFile == null) {
      defaultFile = item.file
    }
    licensePage.push(`LicenseLangString MUILicense ${lcid[item.langWithRegion] || item.lang} "${item.file}"`)
  }

  for (const l of unspecifiedLangs) {
    langOrder.push(l)
    licensePage.push(`LicenseLangString MUILicense ${lcid[l]} "${defaultFile}"`)
  }

  licensePage.push('!insertmacro MUI_PAGE_LICENSE "$(MUILicense)"')

  if (langOrder.length > 0) {
    const defaultLicenseButtons: any = {
      agree: "Agree",
      disagree: "Disagree",
      description: "If you accept the terms of the agreement, click I Agree to continue. You must accept the agreement to install this software."
    }
    const licenseButtonFiles: any = await getLicenseButtonFiles(packager)
    if (licenseButtonFiles.length < 0) {
      return
    }

    let i
    let licenseButtons: any
    for (const prop in defaultLicenseButtons) {
      for (const langWithRegion of langOrder) {
        for (i = 0; i < licenseButtonFiles.length; i++) {
          licenseButtons = await getLicenseButtons(licenseButtonFiles[i])
          if (langWithRegion === licenseButtonFiles[i].langWithRegion) {
            console.log(licenseButtons)
            if (licenseButtons[prop] !== undefined) {
              licensePage.push(`LangString ${prop} ${lcid[langWithRegion]} "${licenseButtons[prop]}"`)
            } else {
              licensePage.push(`LangString ${prop} ${lcid[langWithRegion]} "${defaultLicenseButtons[prop]}"`)
            }
            break
          }
        }
      }
    }
  }

  console.log(licensePage)
  scriptGenerator.macro("licensePage", licensePage)
}
