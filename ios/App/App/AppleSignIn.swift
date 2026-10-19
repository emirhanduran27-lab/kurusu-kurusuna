import UIKit
import Capacitor
import AuthenticationServices

/// Uygulamanın kendi köprü ekranı: Apple ile giriş eklentisini kaydeder.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppleSignInPlugin())
    }
}

/// "Apple ile giriş" için küçük yerel eklenti. JavaScript tarafında Capacitor.registerPlugin('AppleSignIn') ile çağrılır.
/// Dönen identityToken Supabase'e signInWithIdToken ile verilir.
@objc(AppleSignInPlugin)
public class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "AppleSignInPlugin"
    public let jsName = "AppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]
    private var pending: CAPPluginCall?

    @objc func authorize(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let old = self.pending { old.reject("Yeni bir giriş başladı", "CANCELED") }
            self.pending = call
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.email]
            if let nonce = call.getString("nonce") { request.nonce = nonce }
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return bridge?.webView?.window ?? ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = pending else { return }
        pending = nil
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let data = credential.identityToken,
              let token = String(data: data, encoding: .utf8) else {
            call.reject("Apple kimliği alınamadı", "FAILED")
            return
        }
        call.resolve(["identityToken": token, "email": credential.email ?? "", "user": credential.user])
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = pending else { return }
        pending = nil
        let canceled = (error as? ASAuthorizationError)?.code == .canceled
        call.reject(canceled ? "Vazgeçildi" : error.localizedDescription, canceled ? "CANCELED" : "FAILED")
    }
}
