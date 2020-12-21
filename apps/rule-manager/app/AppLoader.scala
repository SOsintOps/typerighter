import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.auth.{AWSCredentialsProvider, AWSCredentialsProviderChain, DefaultAWSCredentialsProviderChain}
import com.gu.conf.{ConfigurationLoader, SSMConfigurationLocation}
import com.gu.{AppIdentity, AwsIdentity, DevIdentity}
import play.api.ApplicationLoader.Context
import play.api._
import com.gu.AppIdentity
import com.amazonaws.auth.AWSCredentialsProvider
import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.gu.DevIdentity
import com.amazonaws.auth.DefaultAWSCredentialsProviderChain
import com.gu.AwsIdentity
import com.gu.conf.SSMConfigurationLocation
import com.gu.conf.ConfigurationLoader


class AppLoader extends ApplicationLoader {
  def load(context: Context): Application = {
    LoggerConfigurator(context.environment.classLoader).foreach {
      _.configure(context.environment, context.initialConfiguration, Map.empty)
    }

    val identity = AppIdentity.whoAmI(defaultAppName = "typerighter-rule-manager")

    val creds: AWSCredentialsProvider = identity match {
      case _: DevIdentity => new ProfileCredentialsProvider("composer")
      case _ => DefaultAWSCredentialsProviderChain.getInstance
    }

    val loadedConfig = ConfigurationLoader.load(identity, creds) {
      case identity: AwsIdentity => SSMConfigurationLocation.default(identity)
      case development: DevIdentity => SSMConfigurationLocation(s"/DEV/flexible/${development.app}")
    }

    new AppComponents(
      context.copy(initialConfiguration = Configuration(loadedConfig).withFallback(context.initialConfiguration)),
      identity,
      creds
    ).application
  }
}
