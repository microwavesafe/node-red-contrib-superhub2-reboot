module.exports = function(RED) {

    const needle = require('needle')
    const cheerio = require('cheerio')

    function SuperHub2RebootNode(config) {
        RED.nodes.createNode(this, config);
        this.baseAddress = "http://" + config.ipAddress;
        this.password = config.password;
        let node = this;

        function reboot(test) {
            needle('get', node.baseAddress)
            .then(response => {
    
                // first get password name attribute (it is randomly generated so we have to scrape the page for it)
                let passwordName = _getPasswordName(response);
                if (passwordName === null) {
                    _failed("Failed to scrape password name");
                    return;
                }
    
                // next post the password using the scraped name
                needle('post', node.baseAddress + '/cgi-bin/VmLoginCgi', passwordName + '=' + node.password, {'Content-Type': 'application/x-www-form-urlencoded'})
                .then(response => {
                    // we have to get the reboot page so we can scrape the randomly generated
                    needle('get', node.baseAddress + '/VmRgRebootRestoreDevice.html')
                    .then(response => {
                        let rebootFormName = _getRebootFormName(response);
                        if (rebootFormName === null) {
                            _failed("Failed to scrape password name");
                            return;
                        }

                        if (test === false) {
                            // next post to cgi reboot form
                            needle( 'post',
                                    node.baseAddress + '/cgi-bin/VmRgRebootResetDeviceCfgCgi',
                                    'VMRebootResetChangeCache=1&' + rebootFormName + '=0',
                                    {'Content-Type': 'application/x-www-form-urlencoded'})
                            .then(response => {
                                _succeeded();
                            })
                            .catch(err => {
                                _failed('Failed to post to reboot form ' + err);
                            });
                        }
                        else {
                            _succeeded();
                        }
                    })
                    .catch(err => {
                        _failed('Failed to get reboot page ' + err);
                    });
                })
                .catch(err => {
                    _failed('Failed to post password login ' + err);
                });
            })
            .catch(err => {
                _failed('Failed to get homepage ' + err);
            });
        }

        function _succeeded() {
            var msg = { payload: true };
            try { node.send(msg); }
            catch(e) {}
        }
    
        function _failed(message) {
            node.error(message);
            var msg = { payload: false };
            try { node.send(msg); }
            catch(e) {}
        }

        function _getRebootFormName(response) {
            let $ = cheerio.load(response.body);
            let rebootFormName = $('#main').find('input[type="hidden"]').next().attr('name');
    
            if ((typeof rebootFormName === "string") && (rebootFormName.length > 0)) {
                return rebootFormName;
            }
            return null;
        }
    
        function _getPasswordName(response) {
            let $ = cheerio.load(response.body);
            let passwordName = $('#password').attr('name');
    
            if ((typeof passwordName === "string") && (passwordName.length > 0)) {
                return passwordName;
            }
            return null;
        }

        node.on('input', function(msg) {
            if (msg.payload === "test") {
                node.warn("Testing superhub2 at " + config.ipAddress);
                reboot(true);
            }
            else if (msg.payload > 0) {
                node.log("Rebooting superhub2 at " + config.ipAddress);
                reboot(false);
            }
        });
    }

    RED.nodes.registerType("superhub2-reboot",SuperHub2RebootNode);
}