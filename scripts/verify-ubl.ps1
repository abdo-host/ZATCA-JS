param(
    [Parameter(Mandatory = $true)][string] $SchemaPath,
    [Parameter(Mandatory = $true)][string[]] $XmlPath
)

$ErrorActionPreference = 'Stop'
$schema = (Resolve-Path -LiteralPath $SchemaPath).Path
$schemas = [System.Xml.Schema.XmlSchemaSet]::new()
# Resolve includes from the locally unpacked official OASIS distribution.
$schemas.XmlResolver = [System.Xml.XmlUrlResolver]::new()
$common = Join-Path (Split-Path (Split-Path $schema)) 'common'
$signatureSchema = Join-Path $common 'UBL-xmldsig-core-schema-2.1.xsd'
# The trusted OASIS schema contains an internal DTD. Invoice input below prohibits DTDs.
$signatureSettings = [System.Xml.XmlReaderSettings]::new()
$signatureSettings.DtdProcessing = [System.Xml.DtdProcessing]::Parse
$signatureSettings.XmlResolver = $null
$signatureReader = [System.Xml.XmlReader]::Create($signatureSchema, $signatureSettings)
try {
    [void] $schemas.Add('http://www.w3.org/2000/09/xmldsig#', $signatureReader)
} finally {
    $signatureReader.Dispose()
}
[void] $schemas.Add('urn:oasis:names:specification:ubl:schema:xsd:Invoice-2', $schema)
$schemas.Compile()

$settings = [System.Xml.XmlReaderSettings]::new()
$settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
$settings.XmlResolver = $null
$settings.ValidationType = [System.Xml.ValidationType]::Schema
$settings.MaxCharactersInDocument = 2MB
$settings.Schemas = $schemas

foreach ($file in $XmlPath) {
    $path = (Resolve-Path -LiteralPath $file).Path
    $reader = [System.Xml.XmlReader]::Create($path, $settings)
    try {
        while ($reader.Read()) { }
        Write-Output "UBL 2.1 XSD passed for $([IO.Path]::GetFileName($path))"
    } finally {
        $reader.Dispose()
    }
}
