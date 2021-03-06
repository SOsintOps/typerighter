package utils

import com.gu.permissions._

import scala.concurrent.duration._
import com.gu.pandomainauth.model.User
import com.gu.typerighter.lib.CommonConfig

object PermissionDeniedError extends Throwable("Permission denied")

trait PermissionsHandler {
  def config: CommonConfig

  private val permissionsStage = if(config.stage == "prod" ) { "PROD" } else { "CODE" }
  private val permissions = PermissionsProvider(PermissionsConfig(permissionsStage, config.awsRegion, config.awsCredentials, config.permissionsBucket))

  def storeIsEmpty: Boolean = {
    permissions.storeIsEmpty
  }

  def hasPermission(user: User, permission: PermissionDefinition): Boolean = {
    user match {
      case User(_, _, email, _) => permissions.hasPermission(permission, email)
      case _ => false
    }
  }
}
