$(function() {
    function Slic3rViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.settingsViewModel = parameters[1];
        self.slicingViewModel = parameters[2];

        self.fileName = ko.observable();

        self.placeholderName = ko.observable();
        self.placeholderDisplayName = ko.observable();
        self.placeholderDescription = ko.observable();

        self.profileName = ko.observable();
        self.profileDisplayName = ko.observable();
        self.profileDescription = ko.observable();
        self.profileAllowOverwrite = ko.observable(true);

        self.uploadElement = $("#settings-slic3r-import");
        self.uploadButton = $("#settings-slic3r-import-start");

        self.fillDensity = ko.observable()
        self.minPrintSpeed = ko.observable()
        self.maxPrintSpeed = ko.observable()

        self.setFillDensityCommand = function () {
            self.sendPrintHeadCommand({
                "command": "fillDensity",
                "factor": self.fillDensity()
            });
        };
         self.setMinPrintSpeedCommand = function () {
            self.sendPrintHeadCommand({
                "command": "minPrintSpeed",
                "factor": self.minPrintSpeed()
            });
        };
         self.setMaxPrintSpeedCommand = function () {
            self.sendPrintHeadCommand({
                "command": "maxPrintSpeed",
                "factor": self.maxPrintSpeed()
            });
        };

        self.profiles = new ItemListHelper(
            "plugin_slic3r_profiles",
            {
                "id": function(a, b) {
                    if (a["key"].toLocaleLowerCase() < b["key"].toLocaleLowerCase()) return -1;
                    if (a["key"].toLocaleLowerCase() > b["key"].toLocaleLowerCase()) return 1;
                    return 0;
                },
                "name": function(a, b) {
                    // sorts ascending
                    var aName = a.name();
                    if (aName === undefined) {
                        aName = "";
                    }
                    var bName = b.name();
                    if (bName === undefined) {
                        bName = "";
                    }

                    if (aName.toLocaleLowerCase() < bName.toLocaleLowerCase()) return -1;
                    if (aName.toLocaleLowerCase() > bName.toLocaleLowerCase()) return 1;
                    return 0;
                }
            },
            {},
            "id",
            [],
            [],
            5
        );
        
        self._sanitize = function(name) {
            return name.replace(/[^a-zA-Z0-9\-_\.\(\) ]/g, "").replace(/ /g, "_");
        };

        self.uploadElement.fileupload({
            dataType: "json",
            maxNumberOfFiles: 1,
            autoUpload: false,
            add: function(e, data) {
                if (data.files.length == 0) {
                    return false;
                }

                self.fileName(data.files[0].name);

                var name = self.fileName().substr(0, self.fileName().lastIndexOf("."));
                self.placeholderName(self._sanitize(name).toLowerCase());
                self.placeholderDisplayName(name);
                self.placeholderDescription("Imported from " + self.fileName() + " on " + formatDate(new Date().getTime() / 1000));

                self.uploadButton.on("click", function() {
                    var form = {
                        allowOverwrite: self.profileAllowOverwrite()
                    };

                    if (self.profileName() !== undefined) {
                        form["name"] = self.profileName();
                    }
                    if (self.profileDisplayName() !== undefined) {
                        form["displayName"] = self.profileDisplayName();
                    }
                    if (self.profileDescription() !== undefined) {
                        form["description"] = self.profileDescription();
                    }

                    data.formData = form;
                    data.submit();
                });
            },
            done: function(e, data) {
                self.fileName(undefined);
                self.placeholderName(undefined);
                self.placeholderDisplayName(undefined);
                self.placeholderDescription(undefined);
                self.profileName(undefined);
                self.profileDisplayName(undefined);
                self.profileDescription(undefined);
                self.profileAllowOverwrite(true);

                $("#settings_plugin_slic3r_import").modal("hide");
                self.requestData();
                self.slicingViewModel.requestData();
            }
        });

        self.removeProfile = function(data) {
            if (!data.resource) {
                return;
            }

            self.profiles.removeItem(function(item) {
                return (item.key == data.key);
            });

            $.ajax({
                url: data.resource(),
                type: "DELETE",
                success: function() {
                    self.requestData();
                    self.slicingViewModel.requestData();
                }
            });
        };

        self.makeProfileDefault = function(data) {
            if (!data.resource) {
                return;
            }

            _.each(self.profiles.items(), function(item) {
                item.isdefault(false);
            });
            var item = self.profiles.getItem(function(item) {
                return item.key == data.key;
            });
            if (item !== undefined) {
                item.isdefault(true);
            }

            $.ajax({
                url: data.resource(),
                type: "PATCH",
                dataType: "json",
                data: JSON.stringify({default: true}),
                contentType: "application/json; charset=UTF-8",
                success: function() {
                    self.requestData();
                }
            });
        };

        self.showImportProfileDialog = function() {
            $("#settings_plugin_slic3r_import").modal("show");
        };

        self.requestData = function() {
            $.ajax({
                url: API_BASEURL + "slicing/slic3r/profiles",
                type: "GET",
                dataType: "json",
                success: self.fromResponse
            });
        };

        self.fromResponse = function(data) {
            var profiles = [];
            _.each(_.keys(data), function(key) {
                profiles.push({
                    key: key,
                    name: ko.observable(data[key].displayName),
                    description: ko.observable(data[key].description),
                    isdefault: ko.observable(data[key].default),
                    resource: ko.observable(data[key].resource)
                });
            });
            self.profiles.updateItems(profiles);
        };

        self.onBeforeBinding = function () {
            self.settings = self.settingsViewModel.settings;
            self.requestData();
        };

        self.showEditManualProfileDialog = function() {
            // load the profile
            self.loadManulProfile();
            $("#settings_plugin_slic3r_manual").modal("show");
        };

        self.loadManulProfile = function() {
            $.ajax({
                url: API_BASEURL + "slicing/slic3r/profiles/manual",
                type: "GET",
                success : function(response, textStatus, jqXhr) {
                    self.fillDensity(response.data["fill_density"].slice(0, response.data["fill_density"].length-1));
                    self.minPrintSpeed(response.data["min_print_speed"]);
                    self.maxPrintSpeed(response.data["max_print_speed"]);
                }
            });
        };

        self.updateManualProfile = function() {
            // overrides the manual profile
            var data = {
                "fill_density": self.fillDensity()+"%",
                "min_print_speed": self.minPrintSpeed(),
                "max_print_speed": self.maxPrintSpeed(),
            };
            $.ajax({
                url: API_BASEURL + "slicing/slic3r/profiles/manual",
                type: "PATCH",
                dataType: "json",
                contentType: "application/json;charset=utf-8",
                data : JSON.stringify({
                    "displayName": "manual",
                    "description": "loaded from manual.default.ini",
                    "data": data,
                    }),
                success : function(response, textStatus, jqXhr) {
                    $("#settings_plugin_slic3r_manual").modal("hide");
                }
            });
        };
    }

    // view model class, parameters for constructor, container to bind to
    ADDITIONAL_VIEWMODELS.push([Slic3rViewModel, ["loginStateViewModel", "settingsViewModel", "slicingViewModel"], document.getElementById("settings_plugin_slic3r_dialog")]);
});