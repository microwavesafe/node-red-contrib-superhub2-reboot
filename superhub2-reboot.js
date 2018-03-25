module.exports = function(RED) {

    const needle = require('needle')
    const cheerio = require('cheerio')

    const TYPE_TEST = "test";
    const TYPE_REBOOT = "reboot";

    class RebootError extends Error{}
    class RebootTestComplete extends Error{}

    function SuperHub2RebootNode(config) {
        RED.nodes.createNode(this, config);
        this.baseAddress = "http://" + config.ipAddress;
        this.password = config.password;
        this.retries = config.retries;
        let node = this;
        node.retryCount = 0;

        function reboot() {
            // first get password name attribute (it is randomly generated so we have to scrape the page for it
            _getHomePage()
            .then(_delay(500))
            .then(response => _getPasswordName(response))
            // post that to the login CGI
            .then(passwordName => _postLogin(passwordName))
            // we have to get the reboot page so we can scrape the randomly generated form name
            .then(_getRebootPage)
            .then(response => _getRebootFormName(response))
             // next post to cgi reboot form
            .then(() => {
                node.send({ payload: true, type: TYPE_REBOOT });
            })
            .catch(err => {
                if (err instanceof RebootTestComplete) {
                    node.send({ payload: true, type: TYPE_TEST });
                }
                else {
                    node.error(err);

                    if (node.retryCount < node.retries) {
                        reboot();
                        node.retryCount++;
                    }
                    else {
                        node.send({ payload: false, type: TYPE_REBOOT });
                    }
                }
            });
        }

        function _delay(ms) {
            return function(x) {
                return new Promise(resolve => setTimeout(() => resolve(x), ms));
            };
        }

        function _getHomePage() {
            return needle('get', node.baseAddress + '/VmLogin.html').catch(err => { throw new RebootError("Failed to get home page " + err) });
        }

        function _getPasswordName(response) {
            let $ = cheerio.load(response.body);
            let passwordName = $('#password').attr('name');
            if ((typeof passwordName === "string") && (passwordName.length > 0)) {
                return passwordName;
            }
            throw new RebootError("Failed to scrape password name");
        }

        function _postLogin(passwordName) {
            return needle('post',
                 node.baseAddress + '/cgi-bin/VmLoginCgi',
                 passwordName + '=' + node.password,
                 {'Content-Type': 'application/x-www-form-urlencoded'})
                .catch(err => { throw new RebootError("Failed to post login form " + err) });
        }

        function _getRebootPage() {
            return needle('get', node.baseAddress + '/VmRgRebootRestoreDevice.html').catch(err => { throw new RebootError("Failed to get reboot page " + err) });
        }

        function _getRebootFormName(response) {
            let $ = cheerio.load(response.body);
            let rebootFormName = $('#main').find('input[type="hidden"]').next().attr('name');
            if ((typeof rebootFormName === "string") && (rebootFormName.length > 0)) {
                if (node.test === true) {
                    throw new RebootTestComplete;
                }
                else {
                    return rebootFormName;
                }
            }
            throw new RebootError("Failed to scrape reboot form name " + response.body);
        }

        function _postRebootForm(rebootFormName) {
            return needle('post',
                           node.baseAddress + '/cgi-bin/VmRgRebootResetDeviceCfgCgi',
                           'VMRebootResetChangeCache=1&' + rebootFormName + '=0',
                           {'Content-Type': 'application/x-www-form-urlencoded'})
            .catch(err => { throw new RebootError("Failed to post reboot form " + err) });
        }

        node.on('input', function(msg) {
            node.test = true;

            if (msg.payload > 0) {
                node.test = false;
                reboot();
            }
            else if (msg.payload === "test") {
                reboot();
            }
        });
    }

    RED.nodes.registerType("superhub2-reboot",SuperHub2RebootNode);
}
